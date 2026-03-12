// ─── TLS Sync Client ──────────────────────────────────────────────────────────
// Connects to a peer's sync server, requests DB snapshot, verifies + imports it
const tls = require('tls');
const logger = require('../logger');
const db = require('./database');
const { decrypt, verify } = require('./crypto');

function requestSync(peer, networkSecret, cb) {
    const { address, tcpPort = 55431, publicKey } = peer;

    const socket = tls.connect({ host: address, port: tcpPort, rejectUnauthorized: false }, () => {
        logger.info('SYNC_CLI', `Connected to ${address}:${tcpPort}`);
        socket.write(JSON.stringify({ type: 'DB_REQUEST' }) + '\n');
    });

    socket.setEncoding('utf8');
    let buf = '';
    let done = false;

    const finish = (err) => {
        if (done) return;
        done = true;
        try { socket.destroy(); } catch { }
        cb && cb(err || null);
    };

    socket.on('data', chunk => {
        buf += chunk;
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
            if (line.trim()) _handleResponse(line.trim(), peer, networkSecret, finish);
        }
    });
    socket.on('error', err => { logger.error('SYNC_CLI', `Error: ${err.message}`); finish(err); });
    socket.on('close', () => finish(new Error('Connection closed before response')));

    setTimeout(() => finish(new Error('Sync timeout')), 20000);
}

function _handleResponse(line, peer, networkSecret, finish) {
    let msg;
    try { msg = JSON.parse(line); } catch { return finish(new Error('Bad JSON from peer')); }
    if (msg.type !== 'DB_SNAPSHOT') return finish(new Error(`Unexpected: ${msg.type}`));

    const { payload, signature, version } = msg;
    const localVer = db.getVersion();

    // 1. Version check
    if (version <= localVer) {
        logger.info('SYNC_CLI', `Peer v${version} ≤ local v${localVer} — already up to date`);
        return finish(null);
    }

    // 2. Signature verification (requires peer's publicKey from discovery)
    if (!peer.publicKey) return finish(new Error('No peer public key — cannot verify'));
    const { data, iv, tag } = payload;
    const sigInput = `${data}:${iv}:${tag}:${version}`;
    if (!verify(sigInput, signature, peer.publicKey)) {
        logger.error('SYNC_CLI', '🚨 SIGNATURE VERIFICATION FAILED — snapshot rejected');
        return finish(new Error('Invalid Ed25519 signature'));
    }

    // 3. Decrypt
    let snapshotStr;
    try { snapshotStr = decrypt({ data, iv, tag }, networkSecret); }
    catch (e) { return finish(new Error(`Decryption failed: ${e.message}`)); }

    // 4. Parse + import
    let snapshot;
    try { snapshot = JSON.parse(snapshotStr); } catch { return finish(new Error('Bad snapshot JSON')); }

    db.importSnapshot(snapshot);
    logger.success('SYNC_CLI', `✅ Synced to v${version} from ${peer.address} — ${snapshot.credentials.length} credentials`);
    finish(null);
}

module.exports = { requestSync };


