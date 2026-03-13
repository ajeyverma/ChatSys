const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const cfg = require('./src/config');
const proto = require('./src/protocol');
const logger = require('./src/logger');

// Lazy-loaded modules
const lazy = {
    get AnonWindowClient() { return require('./src/anonWindowClient'); },
    get ChatClient() { return require('./src/chatClient'); },
    get PrimaryServer() { return require('./src/primaryServer'); },
    get CredNode() { return require('./src/credsync/node'); },
    get credDb() { return require('./src/credsync/database'); },
    get sharedDrive() { return require('./src/extensions/sharedDrive'); }
};

let launcherWin = null;
let roleWin = null;
let anonWin = null;
let activeServer = null;
let activeClient = null;
let activeAnonClient = null;
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

// ─── Single Instance & File Handling ──────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
let pendingFileData = null;

// Simple check for file arguments (skip electron/app path)
function getFileDataFromArgs(args) {
    const lastArg = args[args.length - 1];
    if (lastArg && fs.existsSync(lastArg) && fs.lstatSync(lastArg).isFile()) {
        try {
            const buffer = fs.readFileSync(lastArg);
            const mimeType = getMimeType(lastArg);
            const base64 = buffer.toString('base64');
            return {
                filePath: lastArg,
                data: `data:${mimeType};base64,${base64}`,
                filename: path.basename(lastArg),
                mimeType: mimeType
            };
        } catch (e) {
            logger.error('Main', `Failed to read shared file: ${e.message}`);
        }
    }
    return null;
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.txt': 'text/plain',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip'
    };
    return map[ext] || 'application/octet-stream';
}

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, focus our window and handle file
        if (launcherWin) {
            if (launcherWin.isMinimized()) launcherWin.restore();
            launcherWin.focus();
        } else if (roleWin) {
            if (roleWin.isMinimized()) roleWin.restore();
            roleWin.focus();
            
            const fileData = getFileDataFromArgs(commandLine);
            if (fileData) {
                roleWin.webContents.send('handle-shared-file', fileData);
            }
        } else if (anonWin) {
            if (anonWin.isMinimized()) anonWin.restore();
            anonWin.focus();
        }
    });

    // Check initial args
    pendingFilePath = getFileDataFromArgs(process.argv);
}

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
        // launcherWin.webContents.openDevTools(); // Debug only
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

function createAnonWindow(displayName) {
    if (anonWin && !anonWin.isDestroyed()) {
        anonWin.focus();
        if (anonWin.isMinimized()) anonWin.restore();
        return anonWin;
    }

    anonWin = new BrowserWindow({
        ...WIN_DEFAULTS,
        width: 920,
        height: 680,
        minWidth: 760,
        minHeight: 520,
        frame: false,
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    anonWin.displayName = displayName; // Store for handshake

    anonWin.loadFile(path.join(__dirname, 'renderer', 'anon.html'));
    anonWin.once('ready-to-show', () => {
        anonWin.show();
        // anonWin.webContents.openDevTools(); // Debug only
    });

    anonWin.webContents.once('did-finish-load', () => {
        logger.info('Main', 'Anonymous window loaded, waiting for renderer sync...');
        if (!activeAnonClient) {
            const AnonWindowClient = lazy.AnonWindowClient;
            activeAnonClient = new AnonWindowClient(anonWin);
        } else {
            logger.info('Main', 'activeAnonClient already exists, skipping re-init');
        }
    });

    anonWin.on('closed', () => {
        if (activeAnonClient) {
            activeAnonClient.disconnect();
            activeAnonClient = null;
        }
        anonWin = null;
        logger.info('Main', 'Anonymous chat window closed');
    });

    logger.info('Main', `Created anonymous chat window for ${displayName}`);
    return anonWin;
}

// ─── IPC: Anonymous Chat Ready Handshake ─────────────────────────────────────────
ipcMain.on('anon-renderer-ready', (event) => {
    logger.info('Main', 'Anonymous renderer ready, initializing...');
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    
    // Retrieve display name stored on the window instance
    const displayName = win?.displayName || 'Guest';

    // Ensure client is initialized (fallback for timing issues)
    if (!activeAnonClient) {
        logger.info('Main', 'Initializing activeAnonClient during handshake (fallback)');
        const AnonWindowClient = lazy.AnonWindowClient;
        activeAnonClient = new AnonWindowClient(win);
    }

    logger.info('Main', `Sending anon-init IPC with displayName: ${displayName}`);
    webContents.send('anon-init', { displayName });
    
    if (activeAnonClient) {
        logger.info('Main', `Connecting activeAnonClient for ${displayName}`);
        activeAnonClient.connect('127.0.0.1', cfg.PRIMARY_PORT, displayName);
    }
});

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

// ─── IPC: Anonymous CLI Chat ────────────────────────────────────────────────────
ipcMain.on('launch-anon-chat', (event, payload = {}) => {
    try {
        const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
        const resolvedName = displayName || `${cfg.ANON_PREFIX}${Math.floor(Math.random() * 1000)}`;
        logger.info('Main', `Anonymous chat launch requested for ${resolvedName}`);
        
        // Close launcher
        if (launcherWin) {
            launcherWin.close();
            launcherWin = null;
            logger.debug('Main', 'Launcher window closed');
        }

        // Ensure server is running for local anon chat
        if (!activeServer) {
            logger.debug('Main', 'Starting primary server for anonymous chat');
            startPrimaryServer();
        }

        // Create anonymous chat window
        logger.debug('Main', 'Creating anonymous window...');
        createAnonWindow(resolvedName);
        logger.info('Main', 'Anonymous window created successfully');
    } catch (err) {
        logger.error('Main', `Error launching anonymous chat: ${err.message}`);
        logger.error('Main', err.stack);
    }
});

// ─── IPC: Send Anonymous Message ────────────────────────────────────────────────
ipcMain.on('anon-send-message', (event, payload = {}) => {
    try {
        const text = payload.text || '';
        if (activeAnonClient && text.trim()) {
            const sent = activeAnonClient.sendMessage(text);
            if (sent) {
                logger.debug('Main', 'Anonymous message sent (Content Redacted)');
            } else {
                logger.warn('Main', 'Failed to send anonymous message');
            }
        }
    } catch (err) {
        logger.error('Main', `Error sending anonymous message: ${err.message}`);
    }
});

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

        // Handle file passed via sharing (on initial launch)
        if (pendingFileData) {
            roleWin.webContents.send('handle-shared-file', pendingFileData);
            pendingFileData = null; // Reset so it's only handled once
        }

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
ipcMain.on('win-minimize', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.minimize();
});
ipcMain.on('win-maximize', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) {
        if (w.isMaximized()) w.unmaximize();
        else w.maximize();
    }
});
ipcMain.on('win-close', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.close();
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
ipcMain.handle('ext:get-list', async () => {
    const extRootDir = path.join(__dirname, 'extensions');
    if (!fs.existsSync(extRootDir)) return [];
    
    const extensions = [];
    const dirs = fs.readdirSync(extRootDir);
    dirs.forEach(dir => {
        const jsonPath = path.join(extRootDir, dir, 'extension.json');
        if (fs.existsSync(jsonPath)) {
            try {
                const info = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                extensions.push(info);
            } catch (e) {
                logger.warn('Main', `Error parsing extension.json for ${dir}: ${e.message}`);
            }
        }
    });
    return extensions;
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

    // 2. Load Root Extensions
    try {
        const extRootDir = path.join(__dirname, 'extensions');
        if (fs.existsSync(extRootDir)) {
            const dirs = fs.readdirSync(extRootDir);
            dirs.forEach(dir => {
                const extPath = path.join(extRootDir, dir, 'main.js');
                if (fs.existsSync(extPath)) {
                    const extension = require(extPath);
                    if (extension && typeof extension.init === 'function') {
                        extension.init();
                        logger.info('Main', `Loaded root extension: ${dir}`);
                    }
                }
            });
        }
    } catch (e) {
        logger.warn('Main', `Failed to load some root extensions: ${e.message}`);
    }

    // 3. Open UI
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
