// ─── CredSync Crypto ──────────────────────────────────────────────────────────
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Ed25519 Key Pair ──────────────────────────────────────────────────────────
function generateOrLoadKeyPair(dataDir) {
    const keyDir = path.join(dataDir || path.join(process.cwd(), 'data'), 'keys');
    fs.mkdirSync(keyDir, { recursive: true });
    const privPath = path.join(keyDir, 'node.key');
    const pubPath = path.join(keyDir, 'node.pub');

    if (!fs.existsSync(privPath)) {
        const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' }
        });
        fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
        fs.writeFileSync(pubPath, publicKey);
    }
    return {
        privateKey: fs.readFileSync(privPath, 'utf8'),
        publicKey: fs.readFileSync(pubPath, 'utf8')
    };
}

// ── Signing / Verification ────────────────────────────────────────────────────
function sign(data, privateKeyPem) {
    return crypto.sign(null, Buffer.from(data, 'utf8'), privateKeyPem).toString('base64');
}
function verify(data, signatureB64, publicKeyPem) {
    try {
        return crypto.verify(null, Buffer.from(data, 'utf8'), publicKeyPem, Buffer.from(signatureB64, 'base64'));
    } catch { return false; }
}

// ── AES-256-GCM ───────────────────────────────────────────────────────────────
function deriveKey(secret) { return crypto.scryptSync(secret, 'credsync-aes-v1', 32); }

function encrypt(plaintext, networkSecret) {
    const key = deriveKey(networkSecret);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { data: enc.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
function decrypt({ data, iv, tag }, networkSecret) {
    const key = deriveKey(networkSecret);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return decipher.update(Buffer.from(data, 'base64')) + decipher.final('utf8');
}

module.exports = { generateOrLoadKeyPair, sign, verify, encrypt, decrypt };
