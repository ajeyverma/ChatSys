const fs = require('fs');
const path = require('path');
const { ipcMain, shell, app } = require('electron');

class SharedDriveExtension {
    constructor() {
        this.id = 'sharedDrive';
        this.name = 'Shared Drive';
        this.driveRoot = path.join(app.getPath('documents'), 'ChatSys_Shared_Drive');
    }

    init() {
        this.ensureStructure();
        this.registerIpc();
        this.executeIntegration('pin');

        // Clean up on exit
        app.on('will-quit', () => {
            this.executeIntegration('unpin');
        });
    }

    async getDriveRoot(username) {
        if (!username) return this.driveRoot;
        const configPath = path.join(app.getPath('userData'), `ext_${this.id}_config_${username}.json`);
        if (fs.existsSync(configPath)) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.customPath) return config.customPath;
            } catch (e) { }
        }
        return this.driveRoot;
    }

    async executeIntegration(action, username) {
        const rootPath = await this.getDriveRoot(username);
        const { exec } = require('child_process');
        const scriptPath = path.join(__dirname, 'integrate.ps1');
        const iconPath = path.join(__dirname, '../../assets/icon.ico');
        const command = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}" -path "${rootPath}" -action "${action}" -iconPath "${iconPath}"`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`SharedDrive Integration Error: ${error.message}`);
                return;
            }
            console.log(`SharedDrive Integration (${action}) Success for ${rootPath}`);
        });
    }

    async ensureStructure(username) {
        const rootPath = await this.getDriveRoot(username);
        if (!fs.existsSync(rootPath)) {
            fs.mkdirSync(rootPath, { recursive: true });
        }

        // Get all users from DB to create their folders
        try {
            const credDb = require('../../src/credsync/database');
            const users = credDb.listUsers();
            
            users.forEach(u => {
                const userPath = path.join(rootPath, u.username);
                if (!fs.existsSync(userPath)) {
                    fs.mkdirSync(userPath, { recursive: true });
                    fs.writeFileSync(path.join(userPath, '.chatsys'), ''); 
                }
            });
        } catch (e) {
            console.warn('SharedDrive: Could not pre-create all user folders:', e.message);
        }
    }

    registerIpc() {
        ipcMain.handle(`ext:${this.id}-select-folder`, async () => {
            const { dialog, BrowserWindow } = require('electron');
            const win = BrowserWindow.getFocusedWindow();
            const result = await dialog.showOpenDialog(win, {
                properties: ['openDirectory']
            });
            if (!result.canceled && result.filePaths.length > 0) {
                return result.filePaths[0];
            }
            return null;
        });

        ipcMain.handle(`ext:${this.id}-get-config`, async (event, username) => {
            if (!username) return null;
            const configPath = path.join(app.getPath('userData'), `ext_${this.id}_config_${username}.json`);
            if (fs.existsSync(configPath)) {
                try {
                    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
                } catch (e) { return null; }
            }
            return { autoSync: 'Instant (On Registration)', enableDrive: true, pinQuickAccess: true, customPath: this.driveRoot };
        });

        ipcMain.handle(`ext:${this.id}-set-config`, async (event, config) => {
            const username = config.username;
            if (!username) return { success: false, error: 'No username provided' };

            const configPath = path.join(app.getPath('userData'), `ext_${this.id}_config_${username}.json`);
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
            
            if (config.enableDrive) this.executeIntegration('pin', username);
            else this.executeIntegration('unpin', username);
            
            return { success: true };
        });

        ipcMain.handle(`ext:${this.id}-list`, async (event, username) => {
            try {
                await this.ensureStructure(username);
                const rootPath = await this.getDriveRoot(username);

                const files = fs.readdirSync(rootPath).map(file => {
                    const stats = fs.statSync(path.join(rootPath, file));
                    return { 
                        name: file, 
                        size: stats.size, 
                        mtime: stats.mtime, 
                        isDir: stats.isDirectory() 
                    };
                });
                return { success: true, files, rootPath: rootPath };
            } catch (e) { return { success: false, error: e.message }; }
        });

        ipcMain.handle(`ext:${this.id}-open`, async (event, filename, username) => {
            const rootPath = await this.getDriveRoot(username);
            const fullPath = filename ? path.join(rootPath, filename) : rootPath;
            shell.openPath(fullPath);
            return { success: true };
        });
    }
}

module.exports = new SharedDriveExtension();
