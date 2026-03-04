/**
 * ChatSys Crypto Engine
 * Handles RSA key generation, AES-256-GCM encryption, and hybrid key wrapping.
 */
const crypto = require('crypto');

/**
 * Generate a new RSA 2048-bit key pair for the session.
 * @returns {{publicKey: string, privateKey: string}} PEM strings
 */
function generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
}

/**
 * Encrypt a message string using AES-256-GCM.
 * @param {string} text - Plaintext message
 * @param {Buffer} key - 32-byte AES key
 * @returns {{data: string, iv: string, tag: string}} Base64 encoded components
 */
function encryptAES(text, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag().toString('base64');

    return {
        data: encrypted,
        iv: iv.toString('base64'),
        tag: tag
    };
}

/**
 * Decrypt a message using AES-256-GCM.
 * @param {string} data - Base64 encrypted data
 * @param {Buffer} key - 32-byte AES key
 * @param {string} iv - Base64 IV
 * @param {string} tag - Base64 Auth Tag
 * @returns {string|null} Plaintext or null on failure
 */
function decryptAES(data, key, iv, tag) {
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        let decrypted = decipher.update(data, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('[Crypto] AES Decryption failed:', e.message);
        return null;
    }
}

/**
 * Encrypt a buffer (usually an AES key) with an RSA Public Key.
 * @param {Buffer} buffer - Data to encrypt
 * @param {string} publicKey - PEM Public Key
 * @returns {string} Base64 encoded encrypted data
 */
function encryptRSA(buffer, publicKey) {
    return crypto.publicEncrypt(publicKey, buffer).toString('base64');
}

/**
 * Decrypt a buffer with an RSA Private Key.
 * @param {string} base64Data - Encrypted data
 * @param {string} privateKey - PEM Private Key
 * @returns {Buffer} Decrypted buffer
 */
function decryptRSA(base64Data, privateKey) {
    return crypto.privateDecrypt(privateKey, Buffer.from(base64Data, 'base64'));
}

module.exports = {
    generateKeyPair,
    encryptAES,
    decryptAES,
    encryptRSA,
    decryptRSA,
    generateRandomKey: () => crypto.randomBytes(32)
};
