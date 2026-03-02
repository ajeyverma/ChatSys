/**
 * Chat Client — connects to Primary Server (or promoted Backup).
 * Handles automatic failover reconnection via MSG_ANNOUNCE_PRIMARY.
 */
const net = require('net');
const EventEmitter = require('events');
const cfg = require('./config');
const proto = require('./protocol');

class ChatClient extends EventEmitter {
    constructor(mainWindow) {
        super();
        this.win = mainWindow;
        this.socket = null;
        this.username = '';
        this.currentHost = '127.0.0.1';
        this.currentPort = cfg.PRIMARY_PORT;
        this.connected = false;
        this.reconnecting = false;
        this.redirecting = false;  // true during intentional failover redirect
        this.retryCount = 0;
        this.buffer = '';
    }

    connect(host, port, username) {
        this.currentHost = host;
        this.currentPort = port;
        this.username = username;
        this.retryCount = 0;
        this._emit('set-username', username);
        this._doConnect();
    }

    _doConnect() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
        }

        this.buffer = '';
        this.socket = new net.Socket();
        this.socket.setEncoding('utf8');

        this._emit('status', { status: 'Connecting...', host: this.currentHost, port: this.currentPort });

        this.socket.connect(this.currentPort, this.currentHost, () => {
            this.connected = true;
            this.reconnecting = false;
            this.retryCount = 0;
            this._log(`Connected to ${this.currentHost}:${this.currentPort}`);
            this._emit('status', { status: 'Connected', host: this.currentHost, port: this.currentPort });

            // Send JOIN handshake
            this.socket.write(proto.pack(proto.MSG_JOIN, { username: this.username }));
        });

        this.socket.on('data', (data) => {
            this.buffer += data;
            const frames = proto.splitFrames(this.buffer);
            this.buffer = this.buffer.endsWith('\n') ? '' : (frames.pop() || '');

            for (const frame of frames) {
                const msg = proto.unpack(frame);
                if (!msg) continue;
                this._handleMessage(msg);
            }
        });

        this.socket.on('close', () => {
            this.connected = false;
            // Skip reconnect if we're in a deliberate failover redirect
            if (!this.reconnecting && !this.redirecting) {
                this._log('Connection closed. Attempting to reconnect...');
                this._scheduleReconnect();
            }
        });

        this.socket.on('error', (err) => {
            this._log(`Connection error: ${err.message}`);
            if (err.code === 'ECONNREFUSED' && this.retryCount === 0 && !this.redirecting) {
                // First attempt failed — tell main.js to boot auto-host server
                this.emit('server-not-found');
            } else if (!this.reconnecting && !this.redirecting) {
                this._scheduleReconnect();
            }
        });
    }

    _handleMessage(msg) {
        switch (msg.type) {
            case proto.MSG_CHAT:
                this._emit('message', {
                    type: 'chat',
                    from: msg.payload.from,
                    text: msg.payload.text,
                    ts: msg.ts
                });
                break;

            case proto.MSG_SYS:
                this._emit('message', {
                    type: 'system',
                    text: msg.payload.text,
                    ts: msg.ts
                });
                break;

            case proto.MSG_ANNOUNCE_PRIMARY: {
                // Failover: redirect to new primary
                const newHost = msg.payload.host;
                const newPort = msg.payload.port;
                // Idempotency guard: ignore if we're already on this address
                if (this.connected &&
                    newHost === this.currentHost &&
                    newPort === this.currentPort) {
                    this._log(`Ignoring duplicate MSG_ANNOUNCE_PRIMARY (already at ${newHost}:${newPort})`);
                    break;
                }
                // Also ignore if we're already redirecting to this same address
                if (this.redirecting) {
                    this._log('Ignoring MSG_ANNOUNCE_PRIMARY — redirect already in progress.');
                    break;
                }
                this._log(`New Primary announced: ${newHost}:${newPort}. Redirecting...`);
                this._emit('failover', { host: newHost, port: newPort });
                this._emit('message', {
                    type: 'system',
                    text: `⚡ Server failover! Reconnecting to new primary at ${newHost}:${newPort}...`,
                    ts: Date.now()
                });
                this.currentHost = newHost;
                this.currentPort = newPort;
                this.retryCount = 0;
                this.redirecting = true;
                setTimeout(() => {
                    this.redirecting = false;
                    this._doConnect();
                }, 1000);
                break;
            }

            case proto.MSG_ACK:
                this._emit('ack', { message: msg.payload.message });
                break;

            case proto.MSG_DM:
                this._emit('dm', {
                    from: msg.payload.from,
                    to: msg.payload.to,
                    text: msg.payload.text,
                    ts: msg.payload.ts || Date.now()
                });
                break;

            case proto.MSG_CLIENT_LIST:
                this._emit('client-list', { users: msg.payload.users || [] });
                break;

            case proto.MSG_IMAGE:
                this._emit('image', {
                    from: msg.payload.from,
                    to: msg.payload.to || null,
                    data: msg.payload.data,
                    filename: msg.payload.filename,
                    mimeType: msg.payload.mimeType,
                    ts: msg.payload.ts || Date.now()
                });
                break;
        }
    }

    _scheduleReconnect() {
        if (this.retryCount >= cfg.RECONNECT_ATTEMPTS) {
            this._emit('status', { status: 'Disconnected', host: this.currentHost, port: this.currentPort });
            this._emit('message', { type: 'system', text: '❌ Could not reconnect. Server may be down.', ts: Date.now() });
            return;
        }

        this.reconnecting = true;
        this.retryCount++;
        const delay = cfg.RECONNECT_DELAY * this.retryCount;
        this._emit('status', { status: `Reconnecting (${this.retryCount}/${cfg.RECONNECT_ATTEMPTS})...`, host: this.currentHost, port: this.currentPort });
        this._emit('message', {
            type: 'system',
            text: `🔄 Reconnecting... attempt ${this.retryCount}/${cfg.RECONNECT_ATTEMPTS}`,
            ts: Date.now()
        });

        setTimeout(() => {
            this.reconnecting = false;
            this._doConnect();
        }, delay);
    }

    sendMessage(text) {
        if (!this.connected || !text.trim()) return;
        this.socket.write(proto.pack(proto.MSG_CHAT, { text: text.trim() }));
    }

    sendDM(to, text) {
        if (!this.connected || !text.trim() || !to) return;
        this.socket.write(proto.pack(proto.MSG_DM, { to, text: text.trim() }));
    }

    sendImage(to, data, filename, mimeType) {
        if (!this.connected) return;
        this.socket.write(proto.pack(proto.MSG_IMAGE, {
            to: to || null, data, filename, mimeType
        }));
    }

    disconnect() {
        this.reconnecting = true; // prevent auto-reconnect
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
        }
        this.connected = false;
        this._log('Disconnected.');
    }

    _log(msg) {
        const ts = new Date().toLocaleTimeString();
        console.log(`[${ts}] [Client] ${msg}`);
    }

    _emit(event, data) {
        if (this.win && !this.win.isDestroyed()) this.win.webContents.send(event, data);
    }
}

module.exports = ChatClient;
