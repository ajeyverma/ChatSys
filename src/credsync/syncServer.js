// ─── TLS Sync Server ──────────────────────────────────────────────────────────
// Serves encrypted + signed DB snapshots to replica nodes over TLS TCP
const tls = require('tls');
const { EventEmitter } = require('events');
const logger = require('../logger');
const db = require('./database');
const { sign, encrypt } = require('./crypto');

class SyncServer extends EventEmitter {
    constructor({ certKey, certCert, networkSecret, nodeId, privateKey, isAdmin, tcpPort = 55431 }) {
        super();
        Object.assign(this, { certKey, certCert, networkSecret, nodeId, privateKey, isAdmin, tcpPort });
        this.server = null;
    }

    start() {
        this.server = tls.createServer(
            { key: this.certKey, cert: this.certCert, rejectUnauthorized: false },
            socket => {
                socket.setEncoding('utf8');
                let buf = '';
                socket.on('data', chunk => {
                    buf += chunk;
                    const lines = buf.split('\n');
                    buf = lines.pop();
                    for (const line of lines) if (line.trim()) this._handle(socket, line.trim());
                });
                socket.on('error', err => logger.debug('SYNC_SRV', `Client: ${err.message}`));
            }
        );

        this.server.listen(this.tcpPort, () =>
            logger.info('SYNC_SRV', `TLS sync server listening on :${this.tcpPort}`)
        );
        this.server.on('error', err => logger.error('SYNC_SRV', err.message));
    }

    _handle(socket, line) {
        let msg;
        try { msg = JSON.parse(line); } catch { return; }

        switch (msg.type) {
            case 'VERSION_REQUEST':
                this._send(socket, { type: 'VERSION_RESPONSE', version: db.getVersion() });
                break;
            case 'DB_REQUEST':
                this._sendSnapshot(socket);
                break;
            default:
                this._send(socket, { type: 'ERROR', msg: 'Unknown command' });
        }
    }

    _sendSnapshot(socket) {
        const snapshot = db.exportSnapshot();
        const snapshotStr = JSON.stringify(snapshot);
        const { data, iv, tag } = encrypt(snapshotStr, this.networkSecret);
        const sigInput = `${data}:${iv}:${tag}:${snapshot.meta.version}`;
        const signature = sign(sigInput, this.privateKey);

        this._send(socket, {
            type: 'DB_SNAPSHOT', nodeId: this.nodeId,
            version: parseInt(snapshot.meta.version),
            payload: { data, iv, tag }, signature, isAdmin: this.isAdmin
        });
        logger.info('SYNC_SRV', `Sent DB snapshot v${snapshot.meta.version} (${snapshot.credentials.length} users)`);
    }

    _send(socket, obj) {
        try { socket.write(JSON.stringify(obj) + '\n'); } catch { }
    }

    stop() { if (this.server) this.server.close(); }
}

module.exports = SyncServer;


