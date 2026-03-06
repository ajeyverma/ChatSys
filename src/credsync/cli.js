
// ─── ChatSys CredSync Admin CLI (Arguments Mode) ─────────────────────────────
// Run: npm run cred:admin -- [command] [args...]
// Examples:
//   npm run cred:admin -- add Alice password admin
//   npm run cred:admin -- list
//   npm run cred:admin -- delete Bob
const path = require('path');
const fs = require('fs');
const os = require('os');

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

const args = process.argv.slice(2);
const cmd = args[0] ? args[0].toLowerCase() : 'help';

const help = () => {
    console.log(`
ChatSys CredSync CLI
Usage: npm run cred:admin -- [command] [args...]

Commands:
  list                      List all active users
  add <user> <pass> [role]  Add a new user (role: user/admin/readonly)
  delete <user>             Deactivate a user
  passwd <user> <newpass>   Change a user's password
  role <user> <newrole>     Change a user's role
  info                      Show node and database version info
    `);
};

switch (cmd) {
    case 'list': {
        const users = db.listUsers();
        console.log(`\nRegistered Users (${users.length}):`);
        users.forEach(u => console.log(`- ${u.username.padEnd(15)} [${u.role}] (${u.user_id.slice(0, 8)}...)`));
        break;
    }
    case 'add': {
        const [user, pass, role] = args.slice(1);
        if (!user || !pass) { console.error('Usage: add <user> <pass> [role]'); process.exit(1); }
        db.addUser(user, pass, role || 'user', [], 'cli-admin');
        db.bumpVersion();
        console.log(`Successfully added ${user}. Version bumped.`);
        break;
    }
    case 'delete': {
        const user = args[1];
        if (!user) { console.error('Usage: delete <user>'); process.exit(1); }
        if (db.deleteUser(user, 'cli-admin')) {
            db.bumpVersion();
            console.log(`Deactivated ${user}. Version bumped.`);
        } else console.error(`User ${user} not found.`);
        break;
    }
    case 'passwd': {
        const [user, pass] = args.slice(1);
        if (!user || !pass) { console.error('Usage: passwd <user> <newpass>'); process.exit(1); }
        if (db.changePassword(user, pass, 'cli-admin')) {
            db.bumpVersion();
            console.log(`Password updated for ${user}. Version bumped.`);
        } else console.error(`User ${user} not found.`);
        break;
    }
    case 'role': {
        const [user, role] = args.slice(1);
        if (!user || !role) { console.error('Usage: role <user> <role>'); process.exit(1); }
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
    default:
        help();
}
