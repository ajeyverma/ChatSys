/**
 * Primary Server — Active Node
 * Manages TCP client connections, broadcasts messages,
 * emits UDP heartbeats to backup, and syncs client state.
 */
const net = require('net');
const dgram = require('dgram');
const { ipcMain } = require('electron');
const cfg = require('./config');
const proto = require('./protocol');
const cryptoEngine = require('./crypto_engine');
const logger = require('./logger');
const credDb = require('./credsync/database'); // Distributed Credential DB

class PrimaryServer {
    constructor(mainWindow, backupHost) {
        this.win = mainWindow;
        this.backupHost = backupHost || '127.0.0.1';
        this.clients = new Map();       // socket -> { username, address }
        this.userMap = new Map();       // username -> socket  (for DM routing)
        this.userKeys = new Map();      // username -> publicKey
        const { publicKey, privateKey } = cryptoEngine.generateKeyPair();
        this.publicKey = publicKey;
        this.privateKey = privateKey;
        this.groupKey = cryptoEngine.generateRandomKey();
        this.tcpServer = null;
        this.udpSocket = null; // Used for heartbeat to backup
        this.discoverySocket = null; // Used for LAN discovery broadcast
        this.heartbeatTimer = null;
        this.stateSyncTimer = null;
        this.discoveryTimer = null;
        this.running = false;
        this.msgCount = 0;
        this.hbCount = 0;
    }

    start() {
        this._initUDP();               // UDP must be ready before TCP (for recovery broadcast)
        this._startTCPServer();
        this._startStateSync();
        this._startDiscoveryBeacon();
        this.running = true;
        this._log('Primary Server started on port ' + cfg.PRIMARY_PORT);
        this._emit('status', { status: 'STARTING', port: cfg.PRIMARY_PORT });
    }

    _startTCPServer() {
        this.tcpServer = net.createServer((socket) => {
            socket.setEncoding('utf8');
            let buffer = '';
            let clientInfo = null;

            socket.on('data', (data) => {
                buffer += data;
                const frames = proto.splitFrames(buffer);
                buffer = buffer.endsWith('\n') ? '' : (frames.pop() || '');

                for (const frame of frames) {
                    const msg = proto.unpack(frame);
                    if (!msg) continue;

                    if (msg.type === proto.MSG_JOIN) {
                        const username = (msg.payload.username || 'Unknown').substring(0, cfg.MAX_USERNAME_LEN);
                        const password = msg.payload.password || '';
                        const publicKey = msg.payload.publicKey;

                        const isAnon = msg.payload.isAnonymous && cfg.ALLOW_ANONYMOUS;
                        let user;

                        if (isAnon) {
                            // Check if username is already taken by a registered user
                            if (credDb.getUser(username)) {
                                socket.write(proto.pack(proto.MSG_ACK, { ok: false, message: 'Username is taken by a registered member.' }));
                                socket.end();
                                return;
                            }
                            user = { username, full_name: username, role: 'guest' };
                        } else {
                            // Verify credentials against the distributed replicated database
                            user = credDb.verifyLogin(username, password);
                        }

                        if (!user) {
                            this._log(`Authentication failed for ${username} from ${socket.remoteAddress}`);
                            socket.write(proto.pack(proto.MSG_ACK, {
                                ok: false,
                                message: 'Invalid credentials. Please check your username and password.'
                            }));
                            socket.end();
                            return;
                        }

                        const address = socket.remoteAddress;
                        clientInfo = { username, fullName: user.full_name, address, publicKey, role: user.role };
                        this.clients.set(socket, clientInfo);
                        this.userMap.set(username, socket);
                        this.userKeys.set(username, publicKey);

                        this._log(`${username} (${user.full_name}) joined from ${address}`);
                        this._emit('client-connected', { username, fullName: user.full_name, address, count: this.clients.size });

                        // Encrypt group key for the new member
                        const encryptedGroupKey = cryptoEngine.encryptRSA(this.groupKey, publicKey);
                        socket.write(proto.pack(proto.MSG_ACK, {
                            ok: true,
                            message: 'Connected with encryption',
                            groupKey: encryptedGroupKey
                        }));

                        this._broadcastClientList();

                    } else if (msg.type === proto.MSG_CHAT) {
                        // Regular chat: only for non-guests
                        if (clientInfo && clientInfo.role === 'guest') return;
                        this.msgCount++;
                        const sender = clientInfo ? clientInfo.username : 'Unknown';
                        const senderFullName = clientInfo ? clientInfo.fullName : 'Unknown';
                        const packet = proto.pack(proto.MSG_CHAT, {
                            ...msg.payload,
                            from: sender,
                            fromFullName: senderFullName,
                            ts: Date.now()
                        });
                        this._broadcast(packet, socket, (info) => info.role !== 'guest');
                        this._log(`[MSG] ${senderFullName}: ${msg.payload.encrypted ? '[Encrypted]' : msg.payload.text}`);
                        this._emit('message-relayed', { from: sender, fromFullName: senderFullName, count: this.msgCount });
                    } else if (msg.type === proto.MSG_ANON_CHAT) {
                        // Anonymous CLI chat: isolated from GUI
                        const sender = clientInfo ? clientInfo.username : 'Unknown';
                        const packet = proto.pack(proto.MSG_ANON_CHAT, {
                            ...msg.payload,
                            from: sender,
                            fromFullName: sender,
                            ts: Date.now()
                        });
                        this._broadcast(packet, socket, (info) => info.role === 'guest');
                        this._log(`[ANON-MSG] ${sender}`);

                    } else if (msg.type === proto.MSG_IMAGE) {
                        // Prevent guests from sending/receiving images (GUI only feature)
                        if (clientInfo && clientInfo.role === 'guest') return;
                        const sender = clientInfo ? clientInfo.username : 'Unknown';
                        const senderFullName = clientInfo ? clientInfo.fullName : 'Unknown';
                        const { to, data, filename, mimeType } = msg.payload;
                        const imgPacket = proto.pack(proto.MSG_IMAGE, {
                            ...msg.payload,
                            from: sender,
                            fromFullName: senderFullName,
                            ts: Date.now()
                        });
                        if (to) {
                            if (to === '🖥️ Server') {
                                let decryptedData = data;
                                if (msg.payload.encrypted) {
                                    try {
                                        const sessionKey = cryptoEngine.decryptRSA(msg.payload.encryptedKey, this.privateKey);
                                        decryptedData = cryptoEngine.decryptAES(data, sessionKey, msg.payload.iv, msg.payload.tag);
                                    } catch (e) { decryptedData = null; }
                                }
                                if (!socket.destroyed) socket.write(imgPacket);
                                this._log(`[IMG-DM] ${senderFullName} → Server: ${filename}`);
                                this._emit('image', { from: sender, fromFullName: senderFullName, to: '🖥️ Server', imgData: decryptedData, filename, ts: Date.now() });
                            } else {
                                const recipientSock = this.userMap.get(to);
                                if (recipientSock) {
                                    const recInfo = this.clients.get(recipientSock);
                                    // Guard: DM only between non-guests
                                    if (recInfo && recInfo.role !== 'guest') {
                                        recipientSock.write(imgPacket);
                                        if (!socket.destroyed) socket.write(imgPacket);
                                        this._log(`[IMG-DM] ${senderFullName} → ${to}: ${filename}`);
                                        this._emit('chat-message', { from: sender, fromFullName: senderFullName, image: true, filename, ts: Date.now() });
                                    }
                                }
                            }
                        } else {
                            // Only broadcast to non-guests
                            this._broadcast(imgPacket, socket, (info) => info.role !== 'guest');
                            if (!socket.destroyed) socket.write(imgPacket);
                            this._log(`[IMG] ${senderFullName}: ${filename}`);
                            this._emit('chat-message', { from: sender, fromFullName: senderFullName, image: true, filename, ts: Date.now() });
                        }

                    } else if (msg.type === proto.MSG_DM) {
                        // Prevent guests from sending/receiving DMs (GUI only feature)
                        if (clientInfo && clientInfo.role === 'guest') return;
                        const sender = clientInfo ? clientInfo.username : 'Unknown';
                        const senderFullName = clientInfo ? clientInfo.fullName : 'Unknown';
                        const toUser = msg.payload.to;
                        const recipientSock = this.userMap.get(toUser);

                        if (recipientSock) {
                            const recInfo = this.clients.get(recipientSock);
                            // Guard: DM only if recipient is also not a guest
                            if (recInfo && recInfo.role === 'guest') return;
                        }

                        let toFullName = toUser;
                        if (toUser === '🖥️ Server') {
                            toFullName = '🖥️ Server';
                        } else if (recipientSock) {
                            const recipientInfo = this.clients.get(recipientSock);
                            if (recipientInfo) toFullName = recipientInfo.fullName;
                        }

                        const dmPacket = proto.pack(proto.MSG_DM, {
                            ...msg.payload,
                            from: sender,
                            fromFullName: senderFullName,
                            toFullName: toFullName,
                            ts: Date.now()
                        });

                        if (toUser === '🖥️ Server') {
                            let decryptedText = msg.payload.text;
                            if (msg.payload.encrypted) {
                                try {
                                    const sessionKey = cryptoEngine.decryptRSA(msg.payload.encryptedKey, this.privateKey);
                                    decryptedText = cryptoEngine.decryptAES(msg.payload.text, sessionKey, msg.payload.iv, msg.payload.tag);
                                } catch (e) { decryptedText = '[Decryption Failed]'; }
                            }
                            if (!socket.destroyed) socket.write(dmPacket);
                            this._log(`[DM] ${senderFullName} → Server: ${decryptedText}`);
                            this._emit('dm-message', { from: sender, fromFullName: senderFullName, to: toUser, toFullName, text: decryptedText, ts: Date.now() });
                        } else {
                            if (recipientSock && !recipientSock.destroyed) recipientSock.write(dmPacket);
                            if (!socket.destroyed) socket.write(dmPacket);
                            this._log(`[DM] ${senderFullName} → ${toFullName}: ${msg.payload.encrypted ? '[Encrypted]' : msg.payload.text}`);
                            this._emit('dm-message', { from: sender, fromFullName: senderFullName, to: toUser, toFullName, text: msg.payload.encrypted ? '[Encrypted]' : msg.payload.text, ts: Date.now() });
                        }
                    }
                }
            });

            socket.on('close', () => {
                if (clientInfo) {
                    this.clients.delete(socket);
                    this.userMap.delete(clientInfo.username);
                    this.userKeys.delete(clientInfo.username);
                    this._log(`${clientInfo.username} disconnected.`);
                    this._emit('client-disconnected', { username: clientInfo.username, count: this.clients.size });
                    this._broadcastClientList();
                }
            });

            socket.on('error', (err) => {
                this._log(`Socket error: ${err.message}`);
            });
        });

        this.tcpServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                this._log(`Port ${cfg.PRIMARY_PORT} is in use. Another instance is likely host. Aborting server start...`);
                this.stop();
            } else {
                this._log(`Server error: ${err.message}`);
                this._emit('error', { message: err.message });
            }
        });

        this.tcpServer.listen(cfg.PRIMARY_PORT, () => {
            this._log(`TCP server listening on port ${cfg.PRIMARY_PORT}`);
            this._emit('status', { status: 'ACTIVE', port: cfg.PRIMARY_PORT });
            // Now start sending heartbeats
            this._startHeartbeat();
        });
    }

    /** Send MSG_PRIMARY_RECOVERED to backup over UDP so it demotes itself */
    _broadcastRecovery() {
        const localIP = this._getLocalIP();
        const packet = proto.pack(proto.MSG_PRIMARY_RECOVERED, {
            host: localIP,
            port: cfg.PRIMARY_PORT
        });
        if (this.udpSocket) {
            this.udpSocket.send(packet, 0, packet.length, cfg.HEARTBEAT_PORT, this.backupHost, (err) => {
                if (err) this._log(`Recovery signal error: ${err.message}`);
                else this._log(`Recovery signal sent to backup at ${this.backupHost}:${cfg.HEARTBEAT_PORT}`);
            });
        }
    }

    _initUDP() {
        if (this.udpSocket) return; // already initialized
        this.udpSocket = dgram.createSocket('udp4');
        this.udpSocket.on('error', (err) => {
            this._log(`UDP error: ${err.message}`);
        });
    }

    _startHeartbeat() {
        if (this.heartbeatTimer) return; // already running
        this.heartbeatTimer = setInterval(() => {
            const packet = proto.pack(proto.MSG_HEARTBEAT, { host: this._getLocalIP(), port: cfg.PRIMARY_PORT });
            this.udpSocket.send(packet, 0, packet.length, cfg.HEARTBEAT_PORT, this.backupHost, (err) => {
                if (!err) {
                    this.hbCount++;
                    this._emit('heartbeat-sent', { count: this.hbCount });
                }
            });
        }, cfg.HEARTBEAT_INTERVAL);
    }

    _startStateSync() {
        this.stateSyncTimer = setInterval(() => {
            const clientList = [];
            for (const [, info] of this.clients) {
                clientList.push({ username: info.username, address: info.address, publicKey: info.publicKey });
            }
            const packet = proto.pack(proto.MSG_STATE_SYNC, {
                clients: clientList,
                primaryHost: this._getLocalIP(),
                primaryPort: cfg.PRIMARY_PORT,
                groupKey: this.groupKey.toString('base64')
            });
            if (this.udpSocket) {
                this.udpSocket.send(packet, 0, packet.length, cfg.HEARTBEAT_PORT, this.backupHost);
            }
        }, cfg.STATE_SYNC_INTERVAL);
    }

    _broadcastClientList() {
        const users = [{ username: '🖥️ Server', fullName: '🖥️ Server' }];
        const keys = { '🖥️ Server': this.publicKey };
        for (const [, info] of this.clients) {
            // Only include non-anonymous users for the general list
            if (info.role !== 'guest') {
                users.push({ username: info.username, fullName: info.fullName });
                keys[info.username] = info.publicKey;
            }
        }
        const packet = proto.pack(proto.MSG_CLIENT_LIST, { users, keys });
        // Send to GUI clients only
        this._broadcast(packet, null, (info) => info.role !== 'guest');
        // Update local GUI admin list
        this._emit('client-list', { users: users.filter(u => u.username !== '🖥️ Server') });
    }

    _startDiscoveryBeacon() {
        if (this.discoverySocket) return; // already running

        this.discoverySocket = dgram.createSocket('udp4');
        this.discoverySocket.on('error', (err) => {
            this._log(`Discovery UDP error: ${err.message}`);
        });

        // Use setTimeout to ensure we bind before setting broadcast
        this.discoverySocket.bind(() => {
            this.discoverySocket.setBroadcast(true);
            this._log(`Discovery beacon active on UDP port ${cfg.DISCOVERY_PORT}`);
            this.discoveryTimer = setInterval(() => {
                const packet = proto.pack(proto.MSG_DISCOVERY, {
                    host: this._getLocalIP(),
                    port: cfg.PRIMARY_PORT
                });

                // Broadcast to 255.255.255.255
                this.discoverySocket.send(packet, 0, packet.length, cfg.DISCOVERY_PORT, '255.255.255.255', (err) => {
                    if (err) {
                        // Suppress logs for common EPERM or network unreachable errors during broadcast to avoid spam
                        if (err.code !== 'EPERM' && err.code !== 'ENETUNREACH') {
                            this._log(`Discovery broadcast error: ${err.message}`);
                        }
                    }
                });
            }, cfg.DISCOVERY_INTERVAL);
        });
    }

    _broadcast(packet, excludeSocket, filterFn) {
        for (const [sock, info] of this.clients) {
            if (sock !== excludeSocket && !sock.destroyed) {
                if (filterFn && !filterFn(info)) continue;
                sock.write(packet);
            }
        }
    }

    broadcastSystemMessage(text) {
        const packet = proto.pack(proto.MSG_SYS, { text, ts: Date.now() });
        this._broadcast(packet, null);
        this._log(`[SYSTEM BROADCAST] ${text}`);
    }

    /** Server admin sends a chat message (appears as "Server" in clients) */
    serverSendMessage(text) {
        if (!text.trim()) return;
        const packet = proto.pack(proto.MSG_CHAT, { from: '🖥️ Server', text: text.trim(), ts: Date.now() });
        this._broadcast(packet, null);
        this._log(`[SERVER-MSG] ${text}`);
        this._emit('chat-message', { from: '🖥️ Server', text: text.trim(), ts: Date.now(), self: true });
    }

    /** Server admin DMs a specific client */
    serverSendDM(toUser, text) {
        if (!text.trim() || !toUser) return;
        const recipientSock = this.userMap.get(toUser);
        if (!recipientSock || recipientSock.destroyed) {
            this._log(`[DM-FAIL] User ${toUser} not connected.`);
            return;
        }
        const packet = proto.pack(proto.MSG_DM, { from: '🖥️ Server', to: toUser, text: text.trim(), ts: Date.now() });
        recipientSock.write(packet);
        this._log(`[SERVER-DM] → ${toUser}: ${text}`);
        this._emit('dm-message', { from: '🖥️ Server', to: toUser, text: text.trim(), ts: Date.now(), self: true });
    }

    /** Server admin sends image to all or specific client */
    serverSendImage(toUser, data, filename, mimeType) {
        const imgPacket = proto.pack(proto.MSG_IMAGE, {
            from: '🖥️ Server', to: toUser || null, data, filename, mimeType, ts: Date.now()
        });
        if (toUser) {
            const sock = this.userMap.get(toUser);
            if (sock && !sock.destroyed) sock.write(imgPacket);
        } else {
            this._broadcast(imgPacket, null);
        }
        this._log(`[SERVER-IMG] → ${toUser || 'all'}: ${filename}`);
        this._emit('chat-message', { from: '🖥️ Server', image: true, filename, ts: Date.now(), self: true });
    }

    _getLocalIP() {
        const { networkInterfaces } = require('os');
        const nets = networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) return net.address;
            }
        }
        return '127.0.0.1';
    }

    _log(msg) {
        logger.info('Server', msg);
        if (this.win && !this.win.isDestroyed()) {
            const ts = new Date().toLocaleTimeString();
            this.win.webContents.send('log', `[${ts}] ${msg}`);
        }
    }

    _emit(event, data) {
        if (this.win && !this.win.isDestroyed()) {
            this.win.webContents.send(event, data);
        }
    }

    stop() {
        this.running = false;
        clearInterval(this.heartbeatTimer);
        clearInterval(this.stateSyncTimer);
        clearInterval(this.discoveryTimer);
        if (this.udpSocket) {
            try { this.udpSocket.close(); } catch (e) { }
            this.udpSocket = null;
        }
        if (this.discoverySocket) {
            try { this.discoverySocket.close(); } catch (e) { }
            this.discoverySocket = null;
        }
        if (this.tcpServer) {
            try { this.tcpServer.close(); } catch (e) { }
            this.tcpServer = null;
        }
        for (const [sock] of this.clients) {
            try { sock.destroy(); } catch (e) { }
        }
        this.clients.clear();
        this._log('Primary Server stopped.');
    }
}

module.exports = PrimaryServer;
