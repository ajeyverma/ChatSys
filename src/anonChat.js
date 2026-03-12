/**
 * ChatSys Anonymous Chatbox (CLI)
 * Simple terminal-based client for quick anonymous joins.
 */
const net = require('net');
const readline = require('readline');
const proto = require('./protocol');
const cryptoEngine = require('./crypto_engine');
const cfg = require('./config');

// --- Single Instance Lock ---
const lockServer = net.createServer();
lockServer.on('error', () => {
    console.error('\n\x1b[31m[Error] Another instance of Anonymous Chatbox is already running.\x1b[0m');
    console.log('Please close the existing window before opening a new one.');
    setTimeout(() => process.exit(1), 3000);
});
lockServer.listen(cfg.ANON_LOCK_PORT, '127.0.0.1');
// ----------------------------

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'Message > ',
    historySize: 0 // Disable history to prevent confusion during testing if requested implicitly
});

rl.on('SIGINT', () => {
    process.exit(0);
});

/** Logs an incoming message from the network */
function logToTerminal(message) {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    console.log(message);
    rl.prompt(true);
}

/** Specific helper to overwrite the user's just-typed input line */
function logOwnMessage(text) {
    // 1. Move up 1 line (where the user hit Enter)
    readline.moveCursor(process.stdout, 0, -1);
    // 2. Clear that line entirely
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    // 3. Print the formatted "You: text" line
    console.log(`\x1b[34mYou:\x1b[0m ${text}`);
    // 4. Show a fresh prompt underneath
    rl.prompt(true);
}

/** Assigns a consistent color to a username based on a simple hash */
function getSenderColor(name) {
    if (name === username || name === 'You') return '\x1b[34m'; // Self is always Blue
    const colors = [
        '\x1b[31m', // Red
        '\x1b[32m', // Green
        '\x1b[35m', // Magenta
        '\x1b[36m', // Cyan
        '\x1b[91m', // Bright Red
        '\x1b[92m', // Bright Green
        '\x1b[93m', // Bright Yellow
        '\x1b[95m', // Bright Magenta
        '\x1b[96m', // Bright Cyan
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

let socket = null;
let username = '';
let groupKey = null;
let myKeys = cryptoEngine.generateKeyPair();
let currentBuffer = '';

// Set terminal title
process.stdout.write(`\x1b]2;ChatSys Anonymous Chatbox\x1b\x5c`);

process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); // Clear screen and scrollback
console.log(`\x1b[32m  ___  _             _    ____
 / __|| |__    __ _ | |_ / ___|  _   _  ___
| |   | '_ \\  / _' || __|\\___ \\ | | | |/ __|
| |__ | | | || (_| || |_  ___) || |_| |\\__ \\
 \\___||_| |_| \\__,_| \\__||____/  \\__, ||___/
                                 |___/\x1b[0m
\x1b[31m@Ajay Chaudhary\x1b[0m

\x1b[33mGitHub: https://github.com/AjeyVerma
Instagram: https://instagram.com/ajayverma097
LinkedIn: https://linkedin.com/in/AjeyVerma\x1b[0m
\x1b[36m_________________________________________________\x1b[0m
`);
console.log('\x1b[31mNo login required. Join the global LAN chat instantly.\x1b[0m');
console.log('');

rl.question('Enter your display name: ', (name) => {
    username = name.trim() || 'Guest' + Math.floor(Math.random() * 1000);
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); // True clear
    rl.setPrompt(`\x1b[33m${username} >> \x1b[0m`);
    startChat();
});

function startChat() {
    // console.log(`Connecting to ChatSys on 127.0.0.1...`);

    socket = new net.Socket();

    socket.connect(cfg.PRIMARY_PORT, '127.0.0.1', () => {
        socket.write(proto.pack(proto.MSG_JOIN, {
            username: username,
            isAnonymous: true,
            publicKey: myKeys.publicKey
        }));
    });

    socket.on('data', (data) => {
        currentBuffer += data;
        const frames = proto.splitFrames(currentBuffer);
        currentBuffer = currentBuffer.endsWith('\n') ? '' : (frames.pop() || '');

        for (const frame of frames) {
            const msg = proto.unpack(frame);
            if (msg) handleIncoming(msg);
        }
    });

    socket.on('close', () => {
        console.log('\n\x1b[31m[System] Connection to server lost.\x1b[0m');
        process.exit(0);
    });

    socket.on('error', (err) => {
        console.error('\n\x1b[31m[Error]\x1b[0m ' + err.message);
        process.exit(1);
    });
}

function handleIncoming(msg) {
    if (msg.type === proto.MSG_ACK) {
        if (msg.payload.ok) {
            try {
                groupKey = cryptoEngine.decryptRSA(msg.payload.groupKey, myKeys.privateKey);
                console.log('\x1b[32m%s\x1b[0m', `\n[Success] Connected to ChatSys Anonymous Chatbox. Welcome, ${username}.`);
                console.log('Type your message and press Enter. Ctrl+C to exit.\n');
                rl.prompt();

                rl.on('line', (line) => {
                    const text = line.trim();
                    if (text) {
                        const encrypted = cryptoEngine.encryptAES(text, groupKey);
                        socket.write(proto.pack(proto.MSG_ANON_CHAT, {
                            encrypted: true,
                            ...encrypted
                        }));
                        logOwnMessage(text);
                    } else {
                        rl.prompt();
                    }
                });
            } catch (e) {
                console.error('[Crypto Error] Failed to secure connection.');
                process.exit(1);
            }
        } else {
            console.error('\n\x1b[31m[Rejected]\x1b[0m ' + msg.payload.message);
            process.exit(1);
        }
    } else if (msg.type === proto.MSG_ANON_CHAT) {
        let text = '';
        if (msg.payload.encrypted) {
            if (groupKey) {
                text = cryptoEngine.decryptAES(msg.payload.data, groupKey, msg.payload.iv, msg.payload.tag);
            } else {
                text = '[Encrypted Message]';
            }
        } else {
            text = msg.payload.text;
        }

        // Use helper for clean logging with dynamic coloring
        const sender = msg.payload.from === username ? 'You' : msg.payload.fromFullName;
        const color = getSenderColor(sender);
        logToTerminal(`${color}${sender}:\x1b[0m ${text || ''}`);
    } else if (msg.type === proto.MSG_SYS) {
        logToTerminal(`\x1b[33m[System]\x1b[0m ${msg.payload.text}`);
    }
}
