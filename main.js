const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const cfg = require('./src/config');
const proto = require('./src/protocol');
const logger = require('./src/logger');

let launcherWin = null;
let roleWin = null;
let activeServer = null;
let activeClient = null;
let discoveryListener = null;
let credNode = null; // CredSync node

function createLauncher() {
    launcherWin = new BrowserWindow({
        width: 700,
        height: 520,
        resizable: false,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        backgroundColor: '#0f0f1a'
    });
    launcherWin.loadFile(path.join(__dirname, 'renderer', 'launcher.html'));
    logger.info('Main', 'Launcher window created');

    // Start listening for UDP discovery broadcasts
    startDiscoveryListener();

    launcherWin.on('closed', () => {
        logger.info('Main', 'Launcher closed');
        stopDiscoveryListener();
        launcherWin = null;
    });
}

function createRoleWindow(role, width, height) {
    const win = new BrowserWindow({
        width,
        height,
        minWidth: width - 100,
        minHeight: height - 100,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        backgroundColor: '#0f0f1a'
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
    if (activeServer) {
        logger.warn('Main', 'Primary server already active, not starting new one.');
        return;
    }
    logger.info('Main', 'Booting local back-end PrimaryServer...');
    const PrimaryServer = require('./src/primaryServer');
    // Provide a dummy window for the UI emitting so it doesn't crash on `_emit`
    const dummyWin = {
        webContents: {
            send: (evt, data) => {
                if (evt === 'status' && data.status === 'ACTIVE') {
                    // Notify logic removed for UI decluttering
                }
            }
        },
        isDestroyed: () => false
    };

    activeServer = new PrimaryServer(dummyWin, '127.0.0.1');
    activeServer.start();
    logger.info('Main', 'PrimaryServer started.');
}

// ─── IPC: Auto-Host Launch ──────────────────────────────────────────────────────
ipcMain.on('client-launch', (event, { username, host, port, password, role }) => {
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
        const ChatClient = require('./src/chatClient');
        activeClient = new ChatClient(roleWin);

        // Tell renderer about user role immediately
        roleWin.webContents.send('init-session', { username, role });

        // Listen for internal event when connection is refused (meaning no server)
        activeClient.on('server-not-found', ({ host, port, isInitial, isRedirect, err }) => {
            logger.info('Client', `Connection error: ${err.message}. ${isInitial ? 'First attempt failed.' : ''}`);

            if (isInitial && !isRedirect) {
                logger.warn('Main', `No server found at ${host}:${port}. Booting local back-end...`);
                startPrimaryServer();

                // Retry connecting client once server is ready
                setTimeout(() => {
                    if (activeClient) {
                        logger.info('Main', 'Retrying client connection after auto-host...');
                        activeClient.connect(host, port, username, password);
                    }
                }, 1500);
            }
        });

        // Trigger immediate connection. ChatClient now handles its own status emitting
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
        const credDb = require('./src/credsync/database');
        return credDb.listUsers();
    } catch (e) {
        return [];
    }
});

ipcMain.handle('verify-login', async (event, { username, password }) => {
    try {
        const credDb = require('./src/credsync/database');
        const user = credDb.verifyLogin(username, password);
        return {
            success: !!user,
            error: user ? null : 'Invalid password.',
            user: user ? {
                username: user.username,
                role: user.role,
                mustChange: user.must_change_password
            } : null
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('client:reset-password', async (event, { username, password }) => {
    try {
        const credDb = require('./src/credsync/database');
        const success = credDb.changePassword(username, password, 'self');
        if (success && credNode) credNode.bumpAndAnnounce();
        return { success };
    } catch (e) { return { success: false, error: e.message }; }
});

// ─── IPC: CredSync Administration ─────────────────────────────────────────────
ipcMain.handle('admin:list-users', async () => {
    try {
        const credDb = require('./src/credsync/database');
        return credDb.listUsers(true);
    } catch (e) { return []; }
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
    logger.info('Main', 'ChatSys starting up...');
    logger.info('Main', `Logs are being saved to: ${path.join(app.getPath('userData'), 'logs')}`);

    // ── Start CredSync node ────────────────────────────────────────────────────
    try {
        const CredNode = require('./src/credsync/node');
        const credDataDir = path.join(app.getPath('userData'), 'credsync');
        const credCfgPath = path.join(credDataDir, 'config.json');

        // Auto-create a default config if none exists
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
        credCfg.dataDir = credDataDir; // store keys/db in userData
        credNode = new CredNode(credCfg);
        credNode.start().catch(e => logger.error('CredSync', `Startup error: ${e.message}`));
        logger.info('Main', 'CredSync node started');
    } catch (e) {
        logger.warn('Main', `CredSync not started: ${e.message}`);
    }

    createLauncher();
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
