/**
 * Chat Client — connects to Primary Server (or promoted Backup).
 * Handles automatic failover reconnection via MSG_ANNOUNCE_PRIMARY.
 */
const net = require('net');
const EventEmitter = require('events');
const cfg = require('./config');
const proto = require('./protocol');
const cryptoEngine = require('./crypto_engine');
const logger = require('./logger');

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

        // Encryption state
        const { publicKey, privateKey } = cryptoEngine.generateKeyPair();
        this.publicKey = publicKey;
        this.privateKey = privateKey;
        this.groupKey = null;
        this.userKeys = {}; // username -> publicKey
    }

    connect(host, port, username) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.currentHost = host;
        this.currentPort = port;
        this.username = username;
        this.retryCount = 0;
        this.reconnecting = false;
        this.redirecting = false;
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

            // Send JOIN handshake with public key
            this.socket.write(proto.pack(proto.MSG_JOIN, {
                username: this.username,
                publicKey: this.publicKey
            }));
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
            case proto.MSG_CHAT: {
                let text = msg.payload.text;
                if (msg.payload.encrypted && this.groupKey) {
                    text = cryptoEngine.decryptAES(text, this.groupKey, msg.payload.iv, msg.payload.tag);
                }
                this._emit('message', {
                    type: 'chat',
                    from: msg.payload.from,
                    text: text || '[Encrypted Message - Decryption Failed]',
                    ts: msg.ts
                });
                break;
            }

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
                if (msg.payload.groupKey) {
                    try {
                        this.groupKey = cryptoEngine.decryptRSA(msg.payload.groupKey, this.privateKey);
                        this._log('Group encryption key synchronized.');
                    } catch (e) {
                        this._log('Failed to decrypt group key!');
                    }
                }
                this._emit('ack', { message: msg.payload.message });
                break;

            case proto.MSG_DM: {
                let text = msg.payload.text;
                if (msg.payload.encrypted) {
                    try {
                        const isFromMe = msg.payload.from === this.username;
                        const keyToDecrypt = isFromMe ? msg.payload.senderKey : msg.payload.encryptedKey;

                        if (keyToDecrypt) {
                            const sessionKey = cryptoEngine.decryptRSA(keyToDecrypt, this.privateKey);
                            text = cryptoEngine.decryptAES(text, sessionKey, msg.payload.iv, msg.payload.tag);
                        } else {
                            text = '[Encrypted DM - Key Missing]';
                        }
                    } catch (e) {
                        text = '[Encrypted DM - Decryption Failed]';
                    }
                }
                this._emit('dm', {
                    from: msg.payload.from,
                    to: msg.payload.to,
                    text: text,
                    ts: msg.payload.ts || Date.now()
                });
                break;
            }

            case proto.MSG_CLIENT_LIST:
                this.userKeys = msg.payload.keys || {};
                this._emit('client-list', { users: msg.payload.users || [] });
                break;

            case proto.MSG_IMAGE: {
                let data = msg.payload.data;
                if (msg.payload.encrypted) {
                    try {
                        let key;
                        if (msg.payload.to) {
                            const isFromMe = msg.payload.from === this.username;
                            const keyToDecrypt = isFromMe ? msg.payload.senderKey : msg.payload.encryptedKey;
                            key = cryptoEngine.decryptRSA(keyToDecrypt, this.privateKey);
                        } else {
                            key = this.groupKey;
                        }
                        data = cryptoEngine.decryptAES(data, key, msg.payload.iv, msg.payload.tag);
                    } catch (e) {
                        data = null; // show broken image
                    }
                }
                this._emit('image', {
                    from: msg.payload.from,
                    to: msg.payload.to || null,
                    data: data,
                    filename: msg.payload.filename,
                    mimeType: msg.payload.mimeType,
                    ts: msg.payload.ts || Date.now()
                });
                break;
            }
        }
    }

    _scheduleReconnect() {
        if (this.retryCount >= cfg.RECONNECT_ATTEMPTS) {
            this._emit('status', { status: 'Disconnected', host: this.currentHost, port: this.currentPort });
            this.emit('server-not-found');
            return;
        }

        this.reconnecting = true;
        this.retryCount++;
        const delay = cfg.RECONNECT_DELAY * this.retryCount;
        this._emit('status', { status: `Reconnecting (${this.retryCount}/${cfg.RECONNECT_ATTEMPTS})...`, host: this.currentHost, port: this.currentPort });

        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.reconnecting = false;
            this._doConnect();
        }, delay);
    }

    sendMessage(text) {
        if (!this.connected || !text.trim()) return;
        if (this.groupKey) {
            const encrypted = cryptoEngine.encryptAES(text.trim(), this.groupKey);
            this.socket.write(proto.pack(proto.MSG_CHAT, {
                encrypted: true,
                text: encrypted.data,
                iv: encrypted.iv,
                tag: encrypted.tag
            }));
        } else {
            this.socket.write(proto.pack(proto.MSG_CHAT, { text: text.trim() }));
        }
    }

    sendDM(to, text) {
        if (!this.connected || !text.trim() || !to) return;
        const recipientKey = this.userKeys[to];
        if (recipientKey) {
            const sessionKey = cryptoEngine.generateRandomKey();
            const encryptedMsg = cryptoEngine.encryptAES(text.trim(), sessionKey);
            const encryptedKeyForRecipient = cryptoEngine.encryptRSA(sessionKey, recipientKey);
            const encryptedKeyForMe = cryptoEngine.encryptRSA(sessionKey, this.publicKey);

            this.socket.write(proto.pack(proto.MSG_DM, {
                to,
                encrypted: true,
                text: encryptedMsg.data,
                iv: encryptedMsg.iv,
                tag: encryptedMsg.tag,
                encryptedKey: encryptedKeyForRecipient,
                senderKey: encryptedKeyForMe
            }));
        } else {
            this.socket.write(proto.pack(proto.MSG_DM, { to, text: text.trim() }));
        }
    }

    sendImage(to, data, filename, mimeType) {
        if (!this.connected) return;
        let payload = { to: to || null, data, filename, mimeType };

        if (to) {
            // Private image
            const recipientKey = this.userKeys[to];
            if (recipientKey) {
                const sessionKey = cryptoEngine.generateRandomKey();
                const encryptedImg = cryptoEngine.encryptAES(data, sessionKey);
                const encryptedKeyForRecipient = cryptoEngine.encryptRSA(sessionKey, recipientKey);
                const encryptedKeyForMe = cryptoEngine.encryptRSA(sessionKey, this.publicKey);
                payload = {
                    to,
                    filename,
                    mimeType,
                    encrypted: true,
                    data: encryptedImg.data,
                    iv: encryptedImg.iv,
                    tag: encryptedImg.tag,
                    encryptedKey: encryptedKeyForRecipient,
                    senderKey: encryptedKeyForMe
                };
            }
        } else if (this.groupKey) {
            // Group image
            const encryptedImg = cryptoEngine.encryptAES(data, this.groupKey);
            payload = {
                to: null,
                filename,
                mimeType,
                encrypted: true,
                data: encryptedImg.data,
                iv: encryptedImg.iv,
                tag: encryptedImg.tag
            };
        }

        this.socket.write(proto.pack(proto.MSG_IMAGE, payload));
    }

    disconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnecting = true; // prevent auto-reconnect
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
        }
        this.connected = false;
        this._log('Disconnected.');
    }

    _log(msg) {
        logger.info('Client', msg);
    }

    _emit(event, data) {
        if (this.win && !this.win.isDestroyed()) this.win.webContents.send(event, data);
    }
}

module.exports = ChatClient;
