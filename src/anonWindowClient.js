/**
 * Anonymous Window Client — connects to Primary Server via GUI window.
 * Simplified version of ChatClient for anonymous chat sessions.
 */
const net = require('net');
const EventEmitter = require('events');
const cfg = require('./config');
const proto = require('./protocol');
const cryptoEngine = require('./crypto_engine');
const logger = require('./logger');

class AnonWindowClient extends EventEmitter {
    constructor(mainWindow) {
        super();
        this.win = mainWindow;
        this.socket = null;
        this.displayName = '';
        this.currentHost = '127.0.0.1';
        this.currentPort = cfg.PRIMARY_PORT;
        this.connected = false;
        this.buffer = '';

        // Encryption state
        const { publicKey, privateKey } = cryptoEngine.generateKeyPair();
        this.publicKey = publicKey;
        this.privateKey = privateKey;
        this.groupKey = null;
        this.userKeys = {}; // displayName -> publicKey

        logger.info('AnonWindowClient', 'Initialized');
    }

    /**
     * Connect to the anonymous chat server
     */
    connect(host, port, displayName) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        
        this.currentHost = host;
        this.currentPort = port;
        this.displayName = displayName || `${cfg.ANON_PREFIX}${Math.floor(Math.random() * 10000)}`;
        
        logger.info('AnonWindowClient', `Connecting as: ${this.displayName}`);
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

        logger.info('AnonWindowClient', `Attempting connection to ${this.currentHost}:${this.currentPort}`);
        this._sendToWindow('anon-status', { status: 'Connecting...', host: this.currentHost, port: this.currentPort });

        this.socket.connect(this.currentPort, this.currentHost, () => {
            this.connected = true;
            logger.info('AnonWindowClient', `Connected to ${this.currentHost}:${this.currentPort}`);
            this._sendToWindow('anon-status', { status: 'Connected', host: this.currentHost, port: this.currentPort });

            // Send anonymous JOIN with public key
            try {
                this.socket.write(proto.pack(proto.MSG_JOIN, {
                    username: this.displayName,
                    isAnonymous: true,
                    publicKey: this.publicKey
                }));
                logger.debug('AnonWindowClient', 'Sent anonymous JOIN message');
            } catch (err) {
                logger.error('AnonWindowClient', `Error sending JOIN: ${err.message}`);
                this._sendToWindow('anon-error', { error: err.message });
            }
        });

        this.socket.on('data', (data) => {
            try {
                this.buffer += data;
                const frames = proto.splitFrames(this.buffer);
                this.buffer = this.buffer.endsWith('\n') ? '' : (frames.pop() || '');

                for (const frame of frames) {
                    const msg = proto.unpack(frame);
                    if (!msg) continue;
                    this._handleMessage(msg);
                }
            } catch (err) {
                logger.error('AnonWindowClient', `Error handling data: ${err.message}`);
            }
        });

        this.socket.on('close', () => {
            this.connected = false;
            logger.info('AnonWindowClient', 'Connection closed');
            this._sendToWindow('anon-status', { status: 'Disconnected' });
        });

        this.socket.on('error', (err) => {
            logger.error('AnonWindowClient', `Socket error: ${err.message}`);
            this._sendToWindow('anon-error', { error: err.message });
        });
    }

    /**
     * Handle incoming messages from server
     */
    _handleMessage(msg) {
        if (!msg || !msg.type) return;

        try {
            switch (msg.type) {
                case proto.MSG_ANON_CHAT:
                    this._handleAnonMessage(msg.payload);
                    break;
                case proto.MSG_CLIENT_LIST:
                    this._handleClientList(msg.payload);
                    break;
                case proto.MSG_KEY_EXCHANGE:
                    this._handleKeyExchange(msg.payload);
                    break;
                case proto.MSG_SYS:
                    this._handleSystemMessage(msg.payload);
                    break;
                case proto.MSG_ACK:
                    this._handleAck(msg.payload);
                    break;
                default:
                    logger.debug('AnonWindowClient', `Unknown message type: ${msg.type}`);
            }
        } catch (err) {
            logger.error('AnonWindowClient', `Error handling message: ${err.message}`);
        }
    }

    /**
     * Handle anonymous chat messages
     */
    _handleAnonMessage(payload) {
        if (!payload) return;

        let text = payload.text || '';

        // Handle encrypted messages
        if (payload.encrypted && this.groupKey) {
            try {
                text = cryptoEngine.decryptAES(payload.data, this.groupKey, payload.iv, payload.tag);
            } catch (err) {
                logger.error('AnonWindowClient', `Decryption failed: ${err.message}`);
                text = '[Encrypted Message]';
            }
        }

        // Relay the message to the window
        this._sendToWindow('anon-message', {
            from: payload.from || payload.displayName,
            text: text,
            ts: payload.ts,
            encrypted: !!payload.encrypted
        });

        logger.debug('AnonWindowClient', `Message received from ${payload.from || payload.displayName} (Decrypted)`);
    }

    /**
     * Handle ACK (join success)
     */
    _handleAck(payload) {
        if (payload.ok) {
            if (payload.groupKey) {
                try {
                    this.groupKey = cryptoEngine.decryptRSA(payload.groupKey, this.privateKey);
                    logger.info('AnonWindowClient', 'Secure connection established (group key received)');
                } catch (err) {
                    logger.error('AnonWindowClient', `Failed to decrypt group key: ${err.message}`);
                }
            }
            this._sendToWindow('anon-ready', { ok: true });
        } else {
            logger.error('AnonWindowClient', `Join rejected: ${payload.message}`);
            this._sendToWindow('anon-error', { error: payload.message });
        }
    }

    /**
     * Handle client list updates
     */
    _handleClientList(payload) {
        if (!payload || !payload.clients) return;

        this._sendToWindow('anon-message-users', {
            users: payload.clients
        });

        logger.debug('AnonWindowClient', `Client list updated: ${payload.clients.length} users`);
    }

    /**
     * Handle key exchange (for encryption)
     */
    _handleKeyExchange(payload) {
        if (!payload) return;

        if (payload.groupKey) {
            this.groupKey = payload.groupKey;
            logger.debug('AnonWindowClient', 'Received group key');
        }

        if (payload.displayName && payload.publicKey) {
            this.userKeys[payload.displayName] = payload.publicKey;
            logger.debug('AnonWindowClient', `Received key for ${payload.displayName}`);
        }
    }

    /**
     * Handle system messages (joins, leaves, etc.)
     */
    _handleSystemMessage(payload) {
        if (!payload) return;

        const text = payload.text || payload.message || '';
        this._sendToWindow('anon-message', {
            from: 'System',
            text: text,
            isSystem: true,
            ts: payload.ts
        });

        logger.info('AnonWindowClient', `System message: ${text}`);
    }

    /**
     * Send a message to other users
     */
    sendMessage(text) {
        if (!this.socket || !this.connected) {
            logger.warn('AnonWindowClient', 'Socket not connected, cannot send message');
            return false;
        }

        try {
            let payload = {
                displayName: this.displayName,
                text: text,
                publicKey: this.publicKey
            };

            // Encrypt if group key is available
            if (this.groupKey) {
                const encrypted = cryptoEngine.encryptAES(text, this.groupKey);
                payload = {
                    ...payload,
                    encrypted: true,
                    ...encrypted
                };
                delete payload.text; // Remove plaintext
            }

            this.socket.write(proto.pack(proto.MSG_ANON_CHAT, payload));
            logger.debug('AnonWindowClient', `Sent message (Encrypted: ${!!this.groupKey})`);
            return true;
        } catch (err) {
            logger.error('AnonWindowClient', `Error sending message: ${err.message}`);
            return false;
        }
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        logger.info('AnonWindowClient', 'Disconnecting');
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }
        this.connected = false;
    }

    /**
     * Send IPC message to window
     */
    _sendToWindow(channel, data) {
        if (this.win && !this.win.isDestroyed()) {
            try {
                this.win.webContents.send(channel, data);
            } catch (err) {
                logger.warn('AnonWindowClient', `Failed to send IPC to window: ${err.message}`);
            }
        }
    }

    /**
     * Internal logging
     */
    _log(msg) {
        logger.debug('AnonWindowClient', msg);
    }
}

module.exports = AnonWindowClient;
