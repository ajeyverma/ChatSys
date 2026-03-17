// ─── CredNode — Main Orchestrator ────────────────────────────────────────────
// Wires together: DB init, key/cert loading, discovery, sync server/client
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const db = require('./database');
const { generateOrLoadKeyPair } = require('./crypto');
const { getOrCreateCerts } = require('./certManager');
const Discovery = require('./discovery');
const SyncServer = require('./syncServer');
const { requestSync } = require('./syncClient');

const { EventEmitter } = require('events');

class CredNode extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        // dataDir: caller supplies e.g. path.join(app.getPath('userData'), 'credsync')
        this.dataDir = config.dataDir || path.join(process.cwd(), 'data');
        this.nodeId = this._loadNodeId();
        this.keys = null;
        this.certs = null;
        this.discovery = null;
        this.syncSrv = null;
        this.syncing = false;
    }

    _loadNodeId() {
        fs.mkdirSync(this.dataDir, { recursive: true });
        const p = path.join(this.dataDir, 'node.id');
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
        const id = uuidv4();
        fs.writeFileSync(p, id);
        return id;
    }

    async start() {
        logger.info('NODE', `CredNode ${this.nodeId.slice(0, 8)}… starting`);
        logger.info('NODE', `Role: ${this.config.isAdmin ? '⭐ ADMIN' : '🔁 REPLICA'}`);

        // 1. Database — pass dataDir so SQLite + keys/certs land in userData
        db.init(this.dataDir);
        logger.success('NODE', `SQLite ready — DB v${db.getVersion()}, ${db.listUsers().length} users`);

        // 2. Ed25519 keys
        this.keys = generateOrLoadKeyPair(this.dataDir);
        logger.success('NODE', 'Ed25519 key pair ready');

        // 3. TLS certificates
        this.certs = getOrCreateCerts(this.dataDir);
        logger.success('NODE', 'TLS certificate ready');

        // 4. Sync server (all nodes serve snapshots; only admin-signed ones are trusted)
        this.syncSrv = new SyncServer({
            certKey: this.certs.key, certCert: this.certs.cert,
            networkSecret: this.config.networkSecret,
            nodeId: this.nodeId, privateKey: this.keys.privateKey,
            isAdmin: this.config.isAdmin,
            tcpPort: this.config.tcpPort || 55431
        });
        this.syncSrv.start();

        // 5. UDP Discovery
        this.discovery = new Discovery({
            nodeId: this.nodeId, version: db.getVersion(),
            isAdmin: this.config.isAdmin,
            tcpPort: this.config.tcpPort || 55431,
            publicKey: this.keys.publicKey,
            udpPort: this.config.udpPort || 55430
        });

        this.discovery.on('peer-joined', peer => { if (peer.version > db.getVersion()) this.syncFrom(peer); });
        this.discovery.on('newer-version', peer => this.syncFrom(peer));
        this.discovery.start();

        logger.success('NODE', '🟢 CredNode fully operational');

        if (this.config.isAdmin && db.listUsers().length === 0)
            logger.warn('NODE', 'No users in DB yet. Run: npm run admin');
    }

    syncFrom(peer) {
        if (this.syncing) return;
        this.syncing = true;
        logger.info('NODE', `Initiating sync from peer ${peer.address} v${peer.version}`);
        requestSync(peer, this.config.networkSecret, err => {
            this.syncing = false;
            if (!err) {
                const newVer = db.getVersion();
                this.discovery.updateVersion(newVer);
                this.emit('sync-complete', { version: newVer, from: peer.address });
            }
            else logger.error('NODE', `Sync failed: ${err.message}`);
        });
    }

    /** Call after any admin mutation to bump version and re-announce. */
    bumpAndAnnounce() {
        const v = db.bumpVersion();
        if (this.discovery) this.discovery.updateVersion(v);
        logger.info('NODE', `DB version bumped to v${v}`);
        return v;
    }

    stop() {
        if (this.discovery) this.discovery.stop();
        if (this.syncSrv) this.syncSrv.stop();
        logger.info('NODE', 'CredNode stopped');
    }
}

module.exports = CredNode;


