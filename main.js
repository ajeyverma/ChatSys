/**
 * Electron Main Process — Entry Point
 * Creates windows for each role and manages IPC bridging.
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let launcherWin = null;
let roleWin = null;
let activeServer = null;
let activeClient = null;

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
    return win;
}

// ─── IPC: Role Selection ──────────────────────────────────────────────────────
ipcMain.on('select-role', (event, { role, options }) => {
    if (launcherWin) {
        launcherWin.close();
        launcherWin = null;
    }

    if (role === 'primary') {
        roleWin = createRoleWindow('primary', 1000, 680);
        roleWin.once('ready-to-show', () => roleWin.show());
        roleWin.webContents.once('did-finish-load', () => {
            const PrimaryServer = require('./src/primaryServer');
            activeServer = new PrimaryServer(roleWin, options.backupHost || '127.0.0.1');
            activeServer.start();
        });

    } else if (role === 'backup') {
        roleWin = createRoleWindow('backup', 900, 620);
        roleWin.once('ready-to-show', () => roleWin.show());
        roleWin.webContents.once('did-finish-load', () => {
            const BackupServer = require('./src/backupServer');
            activeServer = new BackupServer(roleWin);
            activeServer.start();
        });

    } else if (role === 'client') {
        roleWin = createRoleWindow('client', 860, 640);
        roleWin.once('ready-to-show', () => roleWin.show());
        roleWin.webContents.once('did-finish-load', () => {
            const ChatClient = require('./src/chatClient');
            activeClient = new ChatClient(roleWin);
            // Signal renderer to show username dialog
            roleWin.webContents.send('request-connect-info', {});
        });
    }

    if (roleWin) {
        roleWin.on('closed', () => {
            if (activeServer) { activeServer.stop(); activeServer = null; }
            if (activeClient) { activeClient.disconnect(); activeClient = null; }
            roleWin = null;
        });
    }
});

// ─── IPC: Client Actions ──────────────────────────────────────────────────────
ipcMain.on('client-connect', (event, { host, port, username }) => {
    if (activeClient) activeClient.connect(host, parseInt(port), username);
});

ipcMain.on('client-send', (event, { text }) => {
    if (activeClient) activeClient.sendMessage(text);
});

ipcMain.on('client-send-dm', (event, { to, text }) => {
    if (activeClient) activeClient.sendDM(to, text);
});

ipcMain.on('client-send-image', (event, { to, data, filename, mimeType }) => {
    if (activeClient) activeClient.sendImage(to, data, filename, mimeType);
});

// ─── IPC: Primary Admin Messaging ─────────────────────────────────────────────
ipcMain.on('server-send-msg', (event, { text }) => {
    if (activeServer && activeServer.serverSendMessage) activeServer.serverSendMessage(text);
});

ipcMain.on('server-send-dm', (event, { to, text }) => {
    if (activeServer && activeServer.serverSendDM) activeServer.serverSendDM(to, text);
});

ipcMain.on('server-send-image', (event, { to, data, filename, mimeType }) => {
    if (activeServer && activeServer.serverSendImage) activeServer.serverSendImage(to, data, filename, mimeType);
});

// ─── IPC: Primary Actions ─────────────────────────────────────────────────────
ipcMain.on('server-broadcast', (event, { text }) => {
    if (activeServer && activeServer.broadcastSystemMessage) {
        activeServer.broadcastSystemMessage(text);
    }
});

// ─── IPC: Window Controls ─────────────────────────────────────────────────────
ipcMain.on('win-minimize', () => {
    const w = roleWin || launcherWin;
    if (w) w.minimize();
});
ipcMain.on('win-close', () => {
    const w = roleWin || launcherWin;
    if (w) w.close();
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(createLauncher);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncher();
});
