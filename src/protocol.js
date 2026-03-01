// Message type constants and packet helpers
const TYPES = {
    MSG_CHAT: 'CHAT',
    MSG_DM: 'DM',
    MSG_CLIENT_LIST: 'CLIENT_LIST',
    MSG_HEARTBEAT: 'HB',
    MSG_ANNOUNCE_PRIMARY: 'NEW_PRIMARY',
    MSG_PRIMARY_RECOVERED: 'PRIMARY_RECOVERED',
    MSG_STATE_SYNC: 'STATE_SYNC',
    MSG_SYS: 'SYS',
    MSG_JOIN: 'JOIN',
    MSG_LEAVE: 'LEAVE',
    MSG_ACK: 'ACK'
};

/**
 * Pack a message into a newline-delimited JSON Buffer.
 * @param {string} type - One of TYPES values
 * @param {object} payload - Arbitrary payload object
 * @returns {Buffer}
 */
function pack(type, payload) {
    const obj = { type, payload, ts: Date.now() };
    return Buffer.from(JSON.stringify(obj) + '\n');
}

/**
 * Unpack a JSON string into { type, payload, ts }.
 * Returns null on parse error.
 * @param {string} str
 * @returns {{ type: string, payload: object, ts: number } | null}
 */
function unpack(str) {
    try {
        return JSON.parse(str.trim());
    } catch {
        return null;
    }
}

/**
 * Split a raw stream buffer by newline to handle multiple frames.
 * @param {string} raw
 * @returns {string[]}
 */
function splitFrames(raw) {
    return raw.split('\n').filter(s => s.trim().length > 0);
}

module.exports = { ...TYPES, pack, unpack, splitFrames };
