const { app } = require('electron');
const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.buffer = [];
        this.logDir = null;
        this.logFile = null;
        
        if (app && app.isReady()) {
            this._setupDir();
        } else if (app) {
            app.once('ready', () => this._setupDir());
        }
    }

    _setupDir() {
        this.logDir = path.join(app.getPath('userData'), 'logs');
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        this.logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);
        
        // Flush buffer
        if (this.buffer.length > 0) {
            fs.appendFileSync(this.logFile, this.buffer.join('\n') + '\n', 'utf8');
            this.buffer = [];
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

        console.log(fullMsg);

        if (this.logFile) {
            try {
                fs.appendFileSync(this.logFile, fullMsg + '\n', 'utf8');
            } catch (err) { }
        } else {
            this.buffer.push(fullMsg);
        }
    }

    success(context, message) { this.log('INFO', context, message); }
    info(context, message) { this.log('INFO', context, message); }
    warn(context, message) { this.log('WARN', context, message); }
    error(context, message) { this.log('ERROR', context, message); }
    debug(context, message) { this.log('DEBUG', context, message); }
}

// Export a singleton instance
module.exports = new Logger();
