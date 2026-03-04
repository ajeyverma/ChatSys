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
                        const publicKey = msg.payload.publicKey;
                        const address = socket.remoteAddress;
                        clientInfo = { username, address, publicKey };
                        this.clients.set(socket, clientInfo);
                        this.userMap.set(username, socket);
                        this.userKeys.set(username, publicKey);

                        this._log(`${username} joined from ${address}`);
                        this._emit('client-connected', { username, address, count: this.clients.size });

                        // Encrypt group key for the new member
                        const encryptedGroupKey = cryptoEngine.encryptRSA(this.groupKey, publicKey);
                        socket.write(proto.pack(proto.MSG_ACK, {
                            ok: true,
                            message: 'Connected with encryption',
                            groupKey: encryptedGroupKey
                        }));

                        this._broadcastClientList();

                    } else if (msg.type === proto.MSG_CHAT) {
                        this.msgCount++;
                        const sender = clientInfo ? clientInfo.username : 'Unknown';
                        // Relay EXACTLY what was sent to preserve encryption fields
                        const packet = proto.pack(proto.MSG_CHAT, {
                            ...msg.payload,
                            from: sender,
                            ts: Date.now()
                        });
                        this._broadcast(packet, socket);
                        this._log(`[MSG] ${sender}: ${msg.payload.encrypted ? '[Encrypted]' : msg.payload.text}`);
                        this._emit('message-relayed', { from: sender, count: this.msgCount });
                        this._emit('chat-message', {
                            from: sender,
                            text: msg.payload.encrypted ? '[Encrypted Payload]' : msg.payload.text,
                            ts: Date.now()
                        });

                    } else if (msg.type === proto.MSG_IMAGE) {
                        const sender = clientInfo ? clientInfo.username : 'Unknown';
                        const { to, data, filename, mimeType } = msg.payload;
                        const imgPacket = proto.pack(proto.MSG_IMAGE, {
                            ...msg.payload,
                            from: sender,
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
                                this._log(`[IMG-DM] ${sender} → Server: ${filename}`);
                                this._emit('image', { from: sender, to: '🖥️ Server', imgData: decryptedData, filename, ts: Date.now() });
                            } else {
                                const recipientSock = this.userMap.get(to);
                                if (recipientSock && !recipientSock.destroyed) recipientSock.write(imgPacket);
                                if (!socket.destroyed) socket.write(imgPacket);
                                this._log(`[IMG-DM] ${sender} → ${to}: ${filename}`);
                                this._emit('chat-message', { from: sender, image: true, filename, ts: Date.now() });
                            }
                        } else {
                            this._broadcast(imgPacket, socket);
                            if (!socket.destroyed) socket.write(imgPacket);
                            this._log(`[IMG] ${sender}: ${filename}`);
                            this._emit('chat-message', { from: sender, image: true, filename, ts: Date.now() });
                        }

                    } else if (msg.type === proto.MSG_DM) {
                        const sender = clientInfo ? clientInfo.username : 'Unknown';
                        const toUser = msg.payload.to;
                        const dmPacket = proto.pack(proto.MSG_DM, {
                            ...msg.payload,
                            from: sender,
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
                            this._log(`[DM] ${sender} → Server: ${decryptedText}`);
                            this._emit('dm-message', { from: sender, to: toUser, text: decryptedText, ts: Date.now() });
                        } else {
                            const recipientSock = this.userMap.get(toUser);
                            if (recipientSock && !recipientSock.destroyed) recipientSock.write(dmPacket);
                            if (!socket.destroyed) socket.write(dmPacket);
                            this._log(`[DM] ${sender} → ${toUser}: ${msg.payload.encrypted ? '[Encrypted]' : msg.payload.text}`);
                            this._emit('dm-message', { from: sender, to: toUser, text: msg.payload.encrypted ? '[Encrypted]' : msg.payload.text, ts: Date.now() });
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
        const users = ['🖥️ Server'];
        const keys = { '🖥️ Server': this.publicKey };
        for (const [, info] of this.clients) {
            users.push(info.username);
            keys[info.username] = info.publicKey;
        }
        const packet = proto.pack(proto.MSG_CLIENT_LIST, { users, keys });
        this._broadcast(packet, null);
        // Don't emit Server to the client UI list (handled internally)
        this._emit('client-list', { users: users.filter(u => u !== '🖥️ Server') });
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

    _broadcast(packet, excludeSocket) {
        for (const [sock] of this.clients) {
            if (sock !== excludeSocket && !sock.destroyed) {
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
        const ts = new Date().toLocaleTimeString();
        const line = `[${ts}] ${msg}`;
        console.log(line);
        if (this.win && !this.win.isDestroyed()) {
            this.win.webContents.send('log', line);
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
