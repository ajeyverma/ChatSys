
// ─── ChatSys CredSync Admin CLI (Interactive & Arguments Mode) ───────────────
const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');

const USER_DATA = path.join(os.homedir(), 'AppData', 'Roaming', 'chatsys');
const CRED_DIR = path.join(USER_DATA, 'credsync');
const CFG_PATH = path.join(CRED_DIR, 'config.json');

if (!fs.existsSync(CFG_PATH)) {
    console.error(`Error: No config found at ${CFG_PATH}`);
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
if (!config.isAdmin) {
    console.error('Error: This node is not an admin. Set "isAdmin": true in config.json');
    process.exit(1);
}

const db = require('./database');
db.init(CRED_DIR);

const help = () => {
    console.log(`
ChatSys CredSync CLI
Commands:
  list                      List all active users
  add <user> <pass> [role]  Add a new user (role: user/admin/readonly)
  delete <user>             Deactivate a user
  passwd <user> <newpass>   Change a user's password
  role <user> <newrole>     Change a user's role
  info                      Show node and database version info
  exit                      Exit the interactive terminal
    `);
};

const executeCommand = (cmd, args) => {
    switch (cmd) {
        case 'list': {
            const users = db.listUsers();
            console.log(`\nRegistered Users (${users.length}):`);
            users.forEach(u => console.log(`- ${u.username.padEnd(15)} [${u.role}] (${u.user_id.slice(0, 8)}...)`));
            break;
        }
        case 'add': {
            const [user, pass, role] = args;
            if (!user || !pass) { console.error('Usage: add <user> <pass> [role]'); return; }
            db.addUser(user, pass, role || 'user', [], 'cli-admin');
            db.bumpVersion();
            console.log(`Successfully added ${user}. Version bumped.`);
            break;
        }
        case 'delete': {
            const user = args[0];
            if (!user) { console.error('Usage: delete <user>'); return; }
            if (db.deleteUser(user, 'cli-admin')) {
                db.bumpVersion();
                console.log(`Deactivated ${user}. Version bumped.`);
            } else console.error(`User ${user} not found.`);
            break;
        }
        case 'passwd': {
            const [user, pass] = args;
            if (!user || !pass) { console.error('Usage: passwd <user> <newpass>'); return; }
            if (db.changePassword(user, pass, 'cli-admin')) {
                db.bumpVersion();
                console.log(`Password updated for ${user}. Version bumped.`);
            } else console.error(`User ${user} not found.`);
            break;
        }
        case 'role': {
            const [user, role] = args;
            if (!user || !role) { console.error('Usage: role <user> <role>'); return; }
            if (db.changeRole(user, role, null, 'cli-admin')) {
                db.bumpVersion();
                console.log(`Role updated to ${role} for ${user}. Version bumped.`);
            } else console.error(`User ${user} not found.`);
            break;
        }
        case 'info': {
            const idFile = path.join(CRED_DIR, 'node.id');
            const nodeId = fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf8').trim() : 'N/A';
            console.log(`\nNode Info:`);
            console.log(`Database Version : ${db.getVersion()}`);
            console.log(`Active Users     : ${db.listUsers().length}`);
            console.log(`Node ID          : ${nodeId}`);
            console.log(`Data Directory   : ${CRED_DIR}`);
            break;
        }
        case 'gui': {
            const { spawn } = require('child_process');
            const isProd = fs.existsSync(path.join(__dirname, '..', '..', 'ChatSys.exe'));
            const exe = isProd ? path.join(__dirname, '..', '..', 'ChatSys.exe') : 'npx';
            const args = isProd ? [] : ['electron', '.'];
            
            console.log('Launching ChatSys GUI...');
            spawn(exe, args, { detached: true, stdio: 'ignore', cwd: path.join(__dirname, '..', '..') }).unref();
            return 'EXIT';
        }
        case 'help':
            help();
            break;
        case 'exit':
        case 'quit':
            return 'EXIT';
        case '':
            break;
        default:
            console.log(`Unknown command: ${cmd}. Type 'help' for options.`);
    }
};

const startREPL = () => {
    let version = 'unknown';
    try {
        version = fs.readFileSync(path.join(__dirname, '..', '..', 'VERSION'), 'utf8').trim();
    } catch(e) {}

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '>>> '
    });

    console.log(`ChatSys ${version} (official, ${new Date().toLocaleDateString()})`);
    console.log('Type "help" for commands, "exit" to quit.');
    rl.prompt();

    rl.on('line', (line) => {
        const parts = line.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        const result = executeCommand(cmd, args);
        if (result === 'EXIT') {
            rl.close();
        } else {
            rl.prompt();
        }
    }).on('close', () => {
        console.log('Exiting ChatSys Terminal.');
        process.exit(0);
    }).on('error', (err) => {
        console.error('Terminal Error:', err);
    });
};

// Main Execution
const args = process.argv.slice(2);
if (args.length === 0) {
    // Interactive Mode
    startREPL();
} else {
    // One-off command mode
    const cmd = args[0].toLowerCase();
    const cmdArgs = args.slice(1);
    executeCommand(cmd, cmdArgs);
}
