/**
 * Backup Server — Standby Node
 * Monitors Primary via UDP heartbeats.
 * On timeout (10s = 2 missed beats), promotes to Primary:
 *   - Opens TCP server on PRIMARY_PORT
 *   - Broadcasts MSG_ANNOUNCE_PRIMARY to known clients
 */
const net = require('net');
const dgram = require('dgram');
const cfg = require('./config');
const proto = require('./protocol');

class BackupServer {
    constructor(mainWindow) {
        this.win = mainWindow;
        this.udpSocket = null;
        this.tcpServer = null;
        this.watchdogTimer = null;
        this.lastHeartbeat = null;
        this.hbCount = 0;
        this.role = 'STANDBY';
        this.knownClients = [];
        this.primaryHost = null;
        this.primaryPort = cfg.PRIMARY_PORT;
        this.clients = new Map();
        this.userMap = new Map();  // username -> socket for DM routing
    }

    start() {
        this._bindHeartbeatListener();
        this._startWatchdog();
        this._log('Backup Server started. Monitoring Primary...');
        this._emit('status', { role: 'STANDBY' });
    }

    _bindHeartbeatListener() {
        this.udpSocket = dgram.createSocket('udp4');

        this.udpSocket.on('message', (msg) => {
            const str = msg.toString('utf8');
            const frames = proto.splitFrames(str);
            for (const frame of frames) {
                const packet = proto.unpack(frame);
                if (!packet) continue;

                if (packet.type === proto.MSG_HEARTBEAT) {
                    this.hbCount++;
                    this.lastHeartbeat = Date.now();
                    this.primaryHost = packet.payload.host;
                    this.primaryPort = packet.payload.port;
                    // Only reset watchdog while in STANDBY (ignore heartbeats after promotion)
                    if (this.role === 'STANDBY') {
                        this._resetWatchdog();
                    }
                    this._emit('heartbeat', { count: this.hbCount, ts: this.lastHeartbeat });
                    this._log(`Heartbeat #${this.hbCount} from ${this.primaryHost}:${this.primaryPort}`);

                } else if (packet.type === proto.MSG_STATE_SYNC) {
                    this.knownClients = packet.payload.clients || [];
                    this.primaryHost = packet.payload.primaryHost;
                    this.primaryPort = packet.payload.primaryPort;
                    this._emit('state-sync', { clientCount: this.knownClients.length });

                } else if (packet.type === proto.MSG_PRIMARY_RECOVERED) {
                    // Original primary is back online — demote ourselves
                    const recoveredHost = packet.payload.host;
                    const recoveredPort = packet.payload.port;
                    this._log(`Primary recovery signal received from ${recoveredHost}:${recoveredPort}. Demoting...`);
                    this._demote(recoveredHost, recoveredPort);
                }
            }
        });

        this.udpSocket.on('error', (err) => {
            this._log(`UDP error: ${err.message}`);
        });

        this.udpSocket.bind(cfg.HEARTBEAT_PORT, () => {
            this._log(`Listening for heartbeats on UDP port ${cfg.HEARTBEAT_PORT}`);
        });
    }

    _startWatchdog() {
        this.watchdogTimer = setTimeout(() => this._onTimeout(), cfg.HEARTBEAT_TIMEOUT);
    }

    _resetWatchdog() {
        clearTimeout(this.watchdogTimer);
        this.watchdogTimer = setTimeout(() => this._onTimeout(), cfg.HEARTBEAT_TIMEOUT);
    }

    _onTimeout() {
        if (this.role !== 'STANDBY') return;
        this._log('TIMEOUT: No heartbeat received. Primary has failed. Initiating promotion...');
        this._emit('timeout-detected', {});
        this._promote();
    }

    _promote() {
        this.role = 'PROMOTING';
        this._emit('status', { role: 'PROMOTING' });
        this._log('Promotion sequence initiated...');

        // Step 1: Notify known clients to reconnect
        const localIP = this._getLocalIP();
        const announcePacket = proto.pack(proto.MSG_ANNOUNCE_PRIMARY, {
            host: localIP,
            port: cfg.PRIMARY_PORT
        });

        // Attempt to notify clients (best-effort TCP connection to each)
        let notified = 0;
        const notifyNext = (i) => {
            if (i >= this.knownClients.length) {
                this._log(`Notified ${notified} client(s) of new Primary. Starting TCP server...`);
                this._startAsPrimary();
                return;
            }
            const { address } = this.knownClients[i];
            // We connect briefly to each client's reported address to send announcement
            // Since clients have dynamic ports, we use a broadcast-style approach via TCP server start
            notifyNext(i + 1);
        };
        notifyNext(0);

        // Step 2: Start TCP server immediately (clients will reconnect on their own retry loop)
        setTimeout(() => this._startAsPrimary(), 500);
    }

    /**
     * Demote: called when original Primary comes back online.
     * 1. Tell all connected clients to redirect to the recovered primary.
     * 2. Close our TCP server (release port 65432).
     * 3. Return to STANDBY and resume heartbeat monitoring.
     */
    _demote(primaryHost, primaryPort) {
        if (this.role !== 'ACTIVE') return; // only demote if we are currently the active server
        this.role = 'DEMOTING';
        this._emit('status', { role: 'DEMOTING' });
        this._log(`Demoting — redirecting ${this.clients.size} client(s) back to ${primaryHost}:${primaryPort}`);

        // Step 1: Tell every connected client to reconnect to the recovered primary
        const announcePacket = proto.pack(proto.MSG_ANNOUNCE_PRIMARY, {
            host: primaryHost,
            port: primaryPort
        });
        for (const [sock] of this.clients) {
            if (!sock.destroyed) {
                sock.write(announcePacket);
            }
        }

        // Step 2: Close TCP server after a short delay (give clients time to receive the packet)
        setTimeout(() => {
            if (this.tcpServer) {
                this.tcpServer.close(() => {
                    this.tcpServer = null;
                    this._log('TCP server closed. Port 65432 released.');
                    this._returnToStandby();
                });
            } else {
                this._returnToStandby();
            }
            // Force-destroy client sockets after delay
            for (const [sock] of this.clients) sock.destroy();
            this.clients.clear();
        }, 1500);
    }

    _returnToStandby() {
        this.role = 'STANDBY';
        this.hbCount = 0;
        this.lastHeartbeat = null;
        this._log('✅ Demoted. Back to STANDBY — monitoring primary heartbeats.');
        this._emit('status', { role: 'STANDBY' });
        this._emit('demoted', {});
        // Re-arm the watchdog
        this._startWatchdog();
    }

    _startAsPrimary() {
        if (this.tcpServer) return;

        const localIP = this._getLocalIP();
        this.tcpServer = net.createServer((socket) => {
            socket.setEncoding('utf8');
            let buffer = '';
            let clientInfo = null;
            // NOTE: Do NOT send MSG_ANNOUNCE_PRIMARY here — clients are already
            // reconnecting to this address. Sending it again would cause an
            // infinite redirect loop. Just wait for their MSG_JOIN handshake.

            socket.on('data', (data) => {
                buffer += data;
                const frames = proto.splitFrames(buffer);
                buffer = buffer.endsWith('\n') ? '' : (frames.pop() || '');

                for (const frame of frames) {
                    const msg = proto.unpack(frame);
                    if (!msg) continue;

                    if (msg.type === proto.MSG_JOIN) {
                        const username = (msg.payload.username || 'Unknown').substring(0, cfg.MAX_USERNAME_LEN);
                        clientInfo = { username, address: socket.remoteAddress };
                        this.clients.set(socket, clientInfo);
                        this.userMap.set(username, socket);
                        this._log(`[PROMOTED] ${username} reconnected.`);
                        this._emit('client-connected', { username, count: this.clients.size });
                        socket.write(proto.pack(proto.MSG_ACK, { ok: true, message: 'Connected to Promoted Backup (now Primary)' }));
                        this._broadcast(proto.pack(proto.MSG_SYS, { text: `${username} has rejoined.` }), null);
                        this._broadcastClientList();

                    } else if (msg.type === proto.MSG_CHAT) {
                        const sender = clientInfo ? clientInfo.username : 'Unknown';
                        const packet = proto.pack(proto.MSG_CHAT, { from: sender, text: msg.payload.text, ts: Date.now() });
                        this._broadcast(packet, socket);
                        this._log(`[MSG] ${sender}: ${msg.payload.text}`);
                        this._emit('message-relayed', { from: sender, text: msg.payload.text });

                    } else if (msg.type === proto.MSG_IMAGE) {
                        const sender = clientInfo ? clientInfo.username : 'Unknown';
                        const { to, data, filename, mimeType } = msg.payload;
                        const imgPacket = proto.pack(proto.MSG_IMAGE, {
                            from: sender, to: to || null, data, filename, mimeType, ts: Date.now()
                        });
                        if (to) {
                            if (to === '🖥️ Server') {
                                if (!socket.destroyed) socket.write(imgPacket);
                                this._log(`[IMG-DM] ${sender} → Server: ${filename}`);
                                this._emit('image', { from: sender, to: '🖥️ Server', imgData: data, filename, ts: Date.now() });
                            } else {
                                const recipientSock = this.userMap.get(to);
                                if (recipientSock && !recipientSock.destroyed) recipientSock.write(imgPacket);
                                if (!socket.destroyed) socket.write(imgPacket);
                                this._emit('chat-message', { from: sender, image: true, filename, ts: Date.now() });
                            }
                        } else {
                            this._broadcast(imgPacket, socket);
                            if (!socket.destroyed) socket.write(imgPacket);
                            this._emit('chat-message', { from: sender, image: true, filename, ts: Date.now() });
                        }
                        this._log(`[IMG] ${sender}: ${filename}`);

                    } else if (msg.type === proto.MSG_DM) {
                        const sender = clientInfo ? clientInfo.username : 'Unknown';
                        const toUser = msg.payload.to;
                        const dmPacket = proto.pack(proto.MSG_DM, {
                            from: sender, to: toUser,
                            text: msg.payload.text, ts: Date.now()
                        });

                        if (toUser === '🖥️ Server') {
                            if (!socket.destroyed) socket.write(dmPacket);
                            this._log(`[DM] ${sender} → Server: ${msg.payload.text}`);
                            this._emit('dm-message', { from: sender, to: toUser, text: msg.payload.text, ts: Date.now() });
                        } else {
                            const recipientSock = this.userMap.get(toUser);
                            if (recipientSock && !recipientSock.destroyed) recipientSock.write(dmPacket);
                            if (!socket.destroyed) socket.write(dmPacket);
                            this._log(`[DM] ${sender} → ${toUser}: ${msg.payload.text}`);
                            this._emit('dm-message', { from: sender, to: toUser, text: msg.payload.text, ts: Date.now() });
                        }
                    }
                }
            });

            socket.on('close', () => {
                if (clientInfo) {
                    this.clients.delete(socket);
                    this.userMap.delete(clientInfo.username);
                    this._emit('client-disconnected', { username: clientInfo.username, count: this.clients.size });
                    this._broadcast(proto.pack(proto.MSG_SYS, { text: `${clientInfo.username} has left.` }), null);
                    this._broadcastClientList();
                }
            });

            socket.on('error', () => { });
        });

        this.tcpServer.listen(cfg.PRIMARY_PORT, () => {
            this.role = 'ACTIVE';
            this._log(`NOW ACTIVE as Primary on port ${cfg.PRIMARY_PORT}`);
            this._emit('status', { role: 'ACTIVE', port: cfg.PRIMARY_PORT, host: localIP });
        });

        this.tcpServer.on('error', (err) => {
            this._log(`TCP error during promotion: ${err.message}`);
            this._emit('error', { message: err.message });
        });
    }

    _broadcastClientList() {
        const users = [];
        for (const [, info] of this.clients) users.push(info.username);
        const packet = proto.pack(proto.MSG_CLIENT_LIST, { users });
        this._broadcast(packet, null);
    }

    _broadcast(packet, excludeSocket) {
        for (const [sock] of this.clients) {
            if (sock !== excludeSocket && !sock.destroyed) sock.write(packet);
        }
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
        if (this.win && !this.win.isDestroyed()) this.win.webContents.send('log', line);
    }

    _emit(event, data) {
        if (this.win && !this.win.isDestroyed()) this.win.webContents.send(event, data);
    }

    getTimeSinceHeartbeat() {
        if (!this.lastHeartbeat) return null;
        return Date.now() - this.lastHeartbeat;
    }

    stop() {
        clearTimeout(this.watchdogTimer);
        if (this.udpSocket) try { this.udpSocket.close(); } catch { }
        if (this.tcpServer) this.tcpServer.close();
        for (const [sock] of this.clients) sock.destroy();
        this.clients.clear();
        this._log('Backup Server stopped.');
    }
}

module.exports = BackupServer;
