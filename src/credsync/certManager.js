// ─── TLS Certificate Manager ──────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

function getOrCreateCerts(dataDir) {
    const certDir = path.join(dataDir || path.join(process.cwd(), 'data'), 'certs');
    fs.mkdirSync(certDir, { recursive: true });
    const keyPath = path.join(certDir, 'node.key');
    const certPath = path.join(certDir, 'node.cert');

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        const selfsigned = require('selfsigned');
        const pems = selfsigned.generate(
            [{ name: 'commonName', value: 'credsync-node' }],
            { days: 3650, algorithm: 'sha256', keySize: 2048 }
        );
        fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
        fs.writeFileSync(certPath, pems.cert);
    }
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

module.exports = { getOrCreateCerts };
