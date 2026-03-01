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

class PrimaryServer {
    constructor(mainWindow, backupHost) {
        this.win = mainWindow;
        this.backupHost = backupHost || '127.0.0.1';
        this.clients = new Map();       // socket -> { username, address }
        this.tcpServer = null;
        this.udpSocket = null;
        this.heartbeatTimer = null;
        this.stateSyncTimer = null;
        this.running = false;
        this.msgCount = 0;
        this.hbCount = 0;
    }

    start() {
        this._initUDP();               // UDP must be ready before TCP (for recovery broadcast)
        this._startTCPServer();
        this._startStateSync();
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
                        const address = socket.remoteAddress;
                        clientInfo = { username, address };
                        this.clients.set(socket, clientInfo);
                        this._log(`${username} joined from ${address}`);
                        this._emit('client-connected', { username, address, count: this.clients.size });
                        this._broadcast(proto.pack(proto.MSG_SYS, {
                            text: `${username} has joined the chat.`
                        }), null);
                        socket.write(proto.pack(proto.MSG_ACK, { ok: true, message: 'Connected to Primary Server' }));

                    } else if (msg.type === proto.MSG_CHAT) {
                        this.msgCount++;
                        const sender = clientInfo ? clientInfo.username : 'Unknown';
                        const packet = proto.pack(proto.MSG_CHAT, {
                            from: sender,
                            text: msg.payload.text,
                            ts: Date.now()
                        });
                        this._broadcast(packet, socket);
                        this._log(`[MSG] ${sender}: ${msg.payload.text}`);
                        this._emit('message-relayed', { from: sender, text: msg.payload.text, count: this.msgCount });
                    }
                }
            });

            socket.on('close', () => {
                if (clientInfo) {
                    this.clients.delete(socket);
                    this._log(`${clientInfo.username} disconnected.`);
                    this._emit('client-disconnected', { username: clientInfo.username, count: this.clients.size });
                    this._broadcast(proto.pack(proto.MSG_SYS, {
                        text: `${clientInfo.username} has left the chat.`
                    }), null);
                }
            });

            socket.on('error', (err) => {
                this._log(`Socket error: ${err.message}`);
            });
        });

        this.tcpServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                // Port is held by the promoted backup — signal it to demote
                this._log(`Port ${cfg.PRIMARY_PORT} is in use (Backup may be active). Sending recovery signal...`);
                this._emit('status', { status: 'RECOVERING', port: cfg.PRIMARY_PORT });
                this._broadcastRecovery();
                // Retry binding after backup has had time to release the port
                setTimeout(() => {
                    if (!this.running) return;
                    this._log(`Retrying bind on port ${cfg.PRIMARY_PORT}...`);
                    this.tcpServer.close();
                    this.tcpServer = null;
                    this._startTCPServer();
                }, 4000);
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
                clientList.push({ username: info.username, address: info.address });
            }
            const packet = proto.pack(proto.MSG_STATE_SYNC, {
                clients: clientList,
                primaryHost: this._getLocalIP(),
                primaryPort: cfg.PRIMARY_PORT
            });
            if (this.udpSocket) {
                this.udpSocket.send(packet, 0, packet.length, cfg.HEARTBEAT_PORT, this.backupHost);
            }
        }, cfg.STATE_SYNC_INTERVAL);
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
        if (this.udpSocket) this.udpSocket.close();
        if (this.tcpServer) this.tcpServer.close();
        for (const [sock] of this.clients) {
            sock.destroy();
        }
        this.clients.clear();
        this._log('Primary Server stopped.');
    }
}

module.exports = PrimaryServer;
