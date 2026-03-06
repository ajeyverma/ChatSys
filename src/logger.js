const { app } = require('electron');
const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        // Use the user's local AppData folder for persistent logs
        this.logDir = path.join(app.getPath('userData'), 'logs');
        this._initDir();
        this.logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);
    }

    _initDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Log a message to both terminal and disk.
     * @param {string} level - INFO, WARN, ERROR, DEBUG
     * @param {string} context - The module/component name
     * @param {string} message - The message body
     */
    log(level, context, message) {
        const timestamp = new Date().toLocaleTimeString();
        const fullMsg = `[${timestamp}] [${level}] [${context}] ${message}`;

        // 1. Terminal Output
        console.log(fullMsg);

        // 2. Disk Output (Append with newline)
        try {
            fs.appendFileSync(this.logFile, fullMsg + '\n', 'utf8');
        } catch (err) {
            console.error('Failed to write to log file:', err.message);
        }
    }

    info(context, message) { this.log('INFO', context, message); }
    warn(context, message) { this.log('WARN', context, message); }
    error(context, message) { this.log('ERROR', context, message); }
    debug(context, message) { this.log('DEBUG', context, message); }
}

// Export a singleton instance
module.exports = new Logger();
