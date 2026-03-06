// ─── UDP Node Discovery ───────────────────────────────────────────────────────
// Broadcasts CREDNODE_HELLO every 5s; emits 'newer-version' and 'peer-joined' events
const dgram = require('dgram');
const { EventEmitter } = require('events');
const logger = require('./logger');

const ANNOUNCE_INTERVAL = 5000;
const PEER_TIMEOUT = 15000;

class Discovery extends EventEmitter {
    constructor({ nodeId, version, isAdmin, tcpPort, publicKey, udpPort = 55430 }) {
        super();
        this.nodeId = nodeId;
        this.version = version;
        this.isAdmin = isAdmin;
        this.tcpPort = tcpPort;
        this.publicKey = publicKey;
        this.udpPort = udpPort;
        this.peers = new Map(); // nodeId → peer info
        this.socket = null;
    }

    start() {
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        this.socket.on('message', (msg, rinfo) => {
            try {
                const pkt = JSON.parse(msg.toString());
                if (pkt.type !== 'CREDNODE_HELLO' || pkt.nodeId === this.nodeId) return;

                const existed = this.peers.has(pkt.nodeId);
                const oldVer = existed ? this.peers.get(pkt.nodeId).version : -1;

                this.peers.set(pkt.nodeId, {
                    nodeId: pkt.nodeId, address: rinfo.address, tcpPort: pkt.tcpPort,
                    version: pkt.version, isAdmin: pkt.isAdmin, publicKey: pkt.publicKey,
                    lastSeen: Date.now()
                });

                if (!existed) {
                    logger.info('DISCOVERY', `New peer: ${pkt.nodeId.slice(0, 8)}… @ ${rinfo.address}:${pkt.tcpPort} v${pkt.version}${pkt.isAdmin ? ' [ADMIN]' : ''}`);
                    this.emit('peer-joined', this.peers.get(pkt.nodeId));
                }
                if (pkt.version > this.version) {
                    logger.info('DISCOVERY', `Peer has newer DB: v${pkt.version} > local v${this.version}`);
                    this.emit('newer-version', this.peers.get(pkt.nodeId));
                }
            } catch { }
        });

        this.socket.on('error', err => logger.error('DISCOVERY', err.message));

        this.socket.bind(this.udpPort, () => {
            this.socket.setBroadcast(true);
            logger.info('DISCOVERY', `UDP discovery listening on :${this.udpPort}`);
            this._announce();
        });

        this._announceTimer = setInterval(() => this._announce(), ANNOUNCE_INTERVAL);
        this._pruneTimer = setInterval(() => this._prune(), PEER_TIMEOUT);
    }

    _announce() {
        const pkt = Buffer.from(JSON.stringify({
            type: 'CREDNODE_HELLO', nodeId: this.nodeId, version: this.version,
            isAdmin: this.isAdmin, tcpPort: this.tcpPort, publicKey: this.publicKey
        }));
        this.socket.send(pkt, this.udpPort, '255.255.255.255', err => {
            if (err) logger.debug('DISCOVERY', `Broadcast error: ${err.message}`);
        });
    }

    _prune() {
        const now = Date.now();
        for (const [id, peer] of this.peers) {
            if (now - peer.lastSeen > PEER_TIMEOUT) {
                this.peers.delete(id);
                logger.info('DISCOVERY', `Peer ${id.slice(0, 8)}… timed out`);
                this.emit('peer-left', id);
            }
        }
    }

    updateVersion(v) { this.version = v; }
    getPeers() { return Array.from(this.peers.values()); }

    stop() {
        clearInterval(this._announceTimer);
        clearInterval(this._pruneTimer);
        if (this.socket) try { this.socket.close(); } catch { }
    }
}

module.exports = Discovery;


