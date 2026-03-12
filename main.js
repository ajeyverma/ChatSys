const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const cfg = require('./src/config');
const proto = require('./src/protocol');
const logger = require('./src/logger');

// Lazy-loaded modules
const lazy = {
    get ChatClient() { return require('./src/chatClient'); },
    get PrimaryServer() { return require('./src/primaryServer'); },
    get CredNode() { return require('./src/credsync/node'); },
    get credDb() { return require('./src/credsync/database'); }
};

let launcherWin = null;
let roleWin = null;
let activeServer = null;
let activeClient = null;
let discoveryListener = null;
let credNode = null; // CredSync node


const WIN_DEFAULTS = {
    backgroundColor: '#0f0f1a',
    show: false,
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
    }
};

function createLauncher() {
    launcherWin = new BrowserWindow({
        ...WIN_DEFAULTS,
        width: 700,
        height: 520,
        resizable: false,
        frame: false,
        icon: path.join(__dirname, 'assets', 'icon.png')
    });
    launcherWin.loadFile(path.join(__dirname, 'renderer', 'launcher.html'));
    launcherWin.once('ready-to-show', () => {
        launcherWin.show();
        startDiscoveryListener();
    });
    logger.info('Main', 'Launcher window created');

    launcherWin.on('closed', () => {
        logger.info('Main', 'Launcher closed');
        stopDiscoveryListener();
        launcherWin = null;
    });
}

function createRoleWindow(role, width, height) {
    const win = new BrowserWindow({
        ...WIN_DEFAULTS,
        width,
        height,
        minWidth: width - 100,
        minHeight: height - 100,
        frame: false
    });
    win.loadFile(path.join(__dirname, 'renderer', `${role}.html`));
    logger.info('Main', `Created ${role} window`);

    win.on('closed', () => {
        logger.info('Main', `${role} window closed`);
        if (role === 'client') activeClient = null;
    });
    return win;
}

// ─── UDP Discovery Listener ───────────────────────────────────────────────────
function startDiscoveryListener() {
    if (discoveryListener) return;

    discoveryListener = dgram.createSocket('udp4');

    discoveryListener.on('listening', () => {
        const address = discoveryListener.address();
        logger.info('Main', `Listening for server discovery beacons on UDP port ${address.port}`);
    });

    discoveryListener.on('message', (msg, rinfo) => {
        try {
            const data = proto.unpack(msg.toString());
            if (data && data.type === proto.MSG_DISCOVERY) {
                if (launcherWin && !launcherWin.isDestroyed()) {
                    // Send discovered server to launcher UI
                    launcherWin.webContents.send('server-discovered', {
                        host: rinfo.address,
                        port: data.payload.port
                    });
                }
            }
        } catch (e) {
            // Ignore malformed packets quietly
        }
    });

    discoveryListener.on('error', (err) => {
        logger.error('Main', `Discovery listener error: ${err.message}`);
        stopDiscoveryListener();
    });

    try {
        discoveryListener.bind(cfg.DISCOVERY_PORT);
    } catch (e) {
        logger.error('Main', `Failed to bind discovery listener: ${e.message}`);
    }
}

function stopDiscoveryListener() {
    if (discoveryListener) {
        try {
            discoveryListener.close();
            logger.info('Main', 'Discovery listener stopped.');
        } catch (e) {
            logger.warn('Main', `Error stopping discovery listener: ${e.message}`);
        }
        discoveryListener = null;
    }
}

// ─── Server Management ────────────────────────────────────────────────────────
function startPrimaryServer() {
    if (activeServer) return;
    logger.info('Main', 'Booting local PrimaryServer...');
    const PrimaryServer = lazy.PrimaryServer;
    const dummyWin = {
        webContents: { send: () => {} },
        isDestroyed: () => false
    };

    activeServer = new PrimaryServer(dummyWin, '127.0.0.1');
    activeServer.start();
}

// ─── IPC: Auto-Host Launch ──────────────────────────────────────────────────────
ipcMain.on('client-launch', (event, { username, host, port, password, role, fullName }) => {
    logger.info('Main', `Client launch requested: username=${username}, role=${role}, host=${host}, port=${port}`);
    if (launcherWin) {
        launcherWin.close();
        launcherWin = null;
    }

    // Always create a Client window
    roleWin = createRoleWindow('client', 860, 640);
    roleWin.maximize();
    roleWin.once('ready-to-show', () => roleWin.show());

    roleWin.webContents.once('did-finish-load', () => {
        const ChatClient = lazy.ChatClient;
        activeClient = new ChatClient(roleWin);

        roleWin.webContents.send('init-session', { username, role, fullName });

        activeClient.on('server-not-found', ({ host, port, isInitial, isRedirect, err }) => {
            if (isInitial && !isRedirect) {
                logger.warn('Main', `No server found. Booting local back-end...`);
                startPrimaryServer();
                setTimeout(() => {
                    if (activeClient) activeClient.connect(host, port, username, password);
                }, 1000);
            }
        });

        activeClient.connect(host, parseInt(port), username, password);
    });

    roleWin.on('closed', () => {
        if (activeServer) { activeServer.stop(); activeServer = null; }
        if (activeClient) { activeClient.disconnect(); activeClient = null; }
        roleWin = null;
        logger.info('Main', 'Client window closed. Active client/server cleaned up.');
    });
});

// ─── IPC: Client Actions ──────────────────────────────────────────────────────
ipcMain.on('client-connect', (event, { host, port, username }) => {
    logger.info('Main', `Client connect requested: host=${host}, port=${port}, username=${username}`);
    if (activeClient) activeClient.connect(host, parseInt(port), username);
});

ipcMain.on('client-send', (event, { text }) => {
    logger.debug('Main', `Client send message: "${text}"`);
    if (activeClient) activeClient.sendMessage(text);
});

ipcMain.on('client-send-dm', (event, { to, text }) => {
    logger.debug('Main', `Client send DM to ${to}: "${text}"`);
    if (activeClient) activeClient.sendDM(to, text);
});

ipcMain.on('client-send-image', (event, { to, data, filename, mimeType }) => {
    logger.debug('Main', `Client send image to ${to}: ${filename} (${mimeType})`);
    if (activeClient) activeClient.sendImage(to, data, filename, mimeType);
});

// ─── IPC: Primary Admin Messaging ─────────────────────────────────────────────
ipcMain.on('server-send-msg', (event, { text }) => {
    logger.info('Main', `Server admin message: "${text}"`);
    if (activeServer && activeServer.serverSendMessage) activeServer.serverSendMessage(text);
});

ipcMain.on('server-send-dm', (event, { to, text }) => {
    logger.info('Main', `Server admin DM to ${to}: "${text}"`);
    if (activeServer && activeServer.serverSendDM) activeServer.serverSendDM(to, text);
});

ipcMain.on('server-send-image', (event, { to, data, filename, mimeType }) => {
    logger.info('Main', `Server admin send image to ${to}: ${filename} (${mimeType})`);
    if (activeServer && activeServer.serverSendImage) activeServer.serverSendImage(to, data, filename, mimeType);
});

// ─── IPC: Primary Actions ─────────────────────────────────────────────────────
ipcMain.on('server-broadcast', (event, { text }) => {
    logger.info('Main', `Server broadcast system message: "${text}"`);
    if (activeServer && activeServer.broadcastSystemMessage) {
        activeServer.broadcastSystemMessage(text);
    }
});

// ─── IPC: Window Controls ─────────────────────────────────────────────────────
ipcMain.on('win-minimize', () => {
    const w = roleWin || launcherWin;
    if (w) {
        w.minimize();
        logger.debug('Main', 'Window minimized');
    }
});
ipcMain.on('win-maximize', () => {
    const w = roleWin || launcherWin;
    if (w) {
        if (w.isMaximized()) {
            w.unmaximize();
            logger.debug('Main', 'Window unmaximized');
        } else {
            w.maximize();
            logger.debug('Main', 'Window maximized');
        }
    }
});
ipcMain.on('win-close', () => {
    const w = roleWin || launcherWin;
    if (w) {
        w.close();
        logger.debug('Main', 'Window close requested');
    }
});

// ─── IPC: CredSync Metadata ────────────────────────────────────────────────────
ipcMain.handle('get-users', async () => {
    try {
        const users = lazy.credDb.listUsers();
        logger.debug('Main', `get-users: found ${users.length} users`);
        return users;
    } catch (e) {
        logger.error('Main', `get-users error: ${e.message}`);
        return [];
    }
});

ipcMain.handle('verify-login', async (event, { username, password }) => {
    try {
        const user = lazy.credDb.verifyLogin(username, password);
        return {
            success: !!user,
            error: user ? null : 'Invalid password.',
            user: user ? {
                username: user.username,
                fullName: user.full_name,
                role: user.role,
                mustChange: user.must_change_password
            } : null
        };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('client:reset-password', async (event, { username, password }) => {
    try {
        const success = lazy.credDb.changePassword(username, password, 'self');
        if (success && credNode) credNode.bumpAndAnnounce();
        return { success };
    } catch (e) { return { success: false, error: e.message }; }
});

// ─── IPC: CredSync Administration ─────────────────────────────────────────────
ipcMain.handle('admin:list-users', async () => {
    try {
        return lazy.credDb.listUsers(true);
    } catch (e) {
        logger.error('Main', `Failed to list users: ${e.message}`);
        return [];
    }
});

ipcMain.handle('admin:add-user', async (event, { username, password, role, fullName }) => {
    try {
        const credDb = require('./src/credsync/database');
        credDb.addUser(username, password, role, [], 'ui-admin', '', 1, fullName); // 1 = must change
        if (credNode) credNode.bumpAndAnnounce();
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('admin:delete-user', async (event, { username }) => {
    try {
        const credDb = require('./src/credsync/database');
        if (credDb.deleteUser(username, 'ui-admin')) {
            if (credNode) credNode.bumpAndAnnounce();
            return { success: true };
        }
        return { success: false, error: 'User not found' };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('admin:change-role', async (event, { username, role }) => {
    try {
        const credDb = require('./src/credsync/database');
        if (credDb.changeRole(username, role, null, 'ui-admin')) {
            if (credNode) credNode.bumpAndAnnounce();
            return { success: true };
        }
        return { success: false, error: 'User not found' };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('admin:rename-role', async (event, { oldRole, newRole }) => {
    try {
        const credDb = require('./src/credsync/database');
        const count = credDb.renameRole(oldRole, newRole, 'ui-admin');
        if (count > 0) {
            if (credNode) credNode.bumpAndAnnounce();
            return { success: true, count };
        }
        return { success: false, error: 'Role not found or no users affected' };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('admin:change-password', async (event, { username, password }) => {
    try {
        const credDb = require('./src/credsync/database');
        if (credDb.changePassword(username, password, 'ui-admin')) {
            if (credNode) credNode.bumpAndAnnounce();
            return { success: true };
        }
        return { success: false, error: 'User not found' };
    } catch (e) { return { success: false, error: e.message }; }
});

// ─── IPC: Registration Requests ──────────────────────────────────────────────
ipcMain.handle('client:apply-id', async (event, { username, password, fullName }) => {
    try {
        const credDb = require('./src/credsync/database');
        if (credDb.isUsernameTaken(username)) {
            return {
                success: false,
                error: `UserID "${username}" is already taken. If this ID belongs to you, please contact the admin.`
            };
        }
        credDb.addApprovalRequest(username, password, fullName);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('admin:list-approvals', async () => {
    try {
        const credDb = require('./src/credsync/database');
        return credDb.listApprovals();
    } catch (e) { return []; }
});

ipcMain.handle('admin:approve-request', async (event, { id }) => {
    try {
        const credDb = require('./src/credsync/database');
        const success = credDb.approveRequest(id, 'ui-admin');
        if (success && credNode) credNode.bumpAndAnnounce();
        return { success };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('admin:reject-request', async (event, { id }) => {
    try {
        const credDb = require('./src/credsync/database');
        const success = credDb.rejectRequest(id);
        return { success };
    } catch (e) { return { success: false, error: e.message }; }
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    const credDataDir = path.join(app.getPath('userData'), 'credsync');
    
    // 1. Initialize DB immediately so IPC 'get-users' works for the launcher
    try {
        lazy.credDb.init(credDataDir);
    } catch (e) {
        logger.error('Main', `DB Init Error: ${e.message}`);
    }

    // 2. Open UI
    createLauncher();

    // 3. Start Peer Node in background
    setTimeout(() => {
        try {
            const credCfgPath = path.join(credDataDir, 'config.json');
            if (!fs.existsSync(credCfgPath)) {
                fs.mkdirSync(credDataDir, { recursive: true });
                fs.writeFileSync(credCfgPath, JSON.stringify({
                    networkName: 'chatsys-lab',
                    networkSecret: 'chatsys-default-secret-change-me',
                    isAdmin: false,
                    tcpPort: 55431,
                    udpPort: 55430
                }, null, 2));
            }
            const credCfg = JSON.parse(fs.readFileSync(credCfgPath, 'utf8'));
            credCfg.dataDir = credDataDir;
            credNode = new (lazy.CredNode)(credCfg);
            credNode.start().catch(e => logger.error('CredSync', `Startup error: ${e.message}`));
        } catch (e) {
            logger.warn('Main', `CredSync node not started: ${e.message}`);
        }
    }, 1000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (credNode) credNode.stop();
        logger.info('Main', 'All windows closed. Quitting.');
        app.quit();
    }
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncher();
});
