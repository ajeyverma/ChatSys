// ─── CredSync Logger (standalone, no Electron dependency) ────────────────────
// Used by src/credsync/* modules so they work independently of Electron's app object.
const C = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
    yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m'
};
const ts = () => new Date().toLocaleTimeString();

module.exports = {
    info: (tag, msg) => console.log(`[${ts()}] [INFO] [${tag}] ${msg}`),
    success: (tag, msg) => console.log(`${C.green}[${ts()}] [INFO] [${tag}] ${msg}${C.reset}`),
    warn: (tag, msg) => console.warn(`[${ts()}] [WARN] [${tag}] ${msg}`),
    error: (tag, msg) => console.error(`[${ts()}] [ERROR] [${tag}] ${msg}`),
    debug: (tag, msg) => process.env.DEBUG && console.log(`[${ts()}] [DEBUG] [${tag}] ${msg}`)
};
