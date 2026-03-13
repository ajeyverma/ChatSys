const SharedDriveExt = {
    id: 'sharedDrive',
    name: 'Shared Drive',
    render(container) {
        container.innerHTML = `
            <div class="mgmt-layout" style="height:100%;">
                <div class="mgmt-sidebar">
                    <div class="mgmt-side-item active" id="sd-tab-overview" onclick="SharedDriveExt.setTab('overview')">
                        <span>📊</span> Overview
                    </div>
                    <div class="mgmt-side-item" id="sd-tab-drive" onclick="api.invoke('ext:sharedDrive-open', '')">
                        <span>📂</span> Open Local Drive (S:)
                    </div>
                    <div class="mgmt-side-item" id="sd-tab-settings" onclick="SharedDriveExt.setTab('settings')">
                        <span>⚙️</span> Sync Settings
                    </div>
                </div>
                <div class="mgmt-main" id="sd-main-content" style="padding:20px;">
                    <!-- Content will be injected here -->
                </div>
            </div>
        `;
        this.setTab('overview');
    },

    setTab(tab) {
        // Update Sidebar UI
        document.querySelectorAll('.mgmt-side-item[id^="sd-tab-"]').forEach(el => el.classList.remove('active'));
        const activeTab = document.getElementById(`sd-tab-${tab}`);
        if (activeTab) activeTab.classList.add('active');

        const main = document.getElementById('sd-main-content');
        if (tab === 'overview') {
            main.innerHTML = `
                <div class="users-mgmt-header">
                    <h2>Shared Drive Overview</h2>
                    <p>Network storage and user sync status.</p>
                </div>
                
                <div class="mgmt-split-layout" style="margin-top:20px;">
                    <div class="mgmt-main-col">
                         <div class="mgmt-card">
                            <h3>Drive Identity</h3>
                            <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px; word-break:break-all;">
                                System Path: <code id="drive-local-path" style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">Loading...</code>
                            </div>
                            <div style="font-size:11px; margin-bottom:12px; color:var(--accent); display:flex; align-items:center; gap:5px;">
                                <span>🛡️</span> Explorer Integration: <strong>ChatSys Drive (Mapped to S:)</strong>
                            </div>
                        </div>

                        <div class="mgmt-card" style="margin-top:20px;">
                            <h3>Synchronized User Folders</h3>
                            <p style="font-size:12px; color:var(--text-muted); margin-bottom:15px;">Each registered user has a dedicated folder for secure LAN file exchange.</p>
                            <div id="sd-user-folder-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:10px;">
                                <!-- User folders will be listed here -->
                            </div>
                        </div>
                    </div>

                    <div class="mgmt-side-col">
                        <div class="mgmt-info-card">
                            <h3>Storage Usage</h3>
                            <div style="font-size:24px; font-weight:700; color:var(--accent); margin:10px 0;" id="drive-usage-val">--</div>
                            <div style="font-size:11px; color:var(--text-muted);">Active Folders: <span id="drive-folder-count" style="color:#10b981; font-weight:600;">-</span></div>
                        </div>
                        
                        <div class="mgmt-info-card" style="margin-top:20px;">
                            <h3>Quick Actions</h3>
                            <button class="mgmt-btn" style="width:100%; margin-bottom:8px;" onclick="api.invoke('ext:sharedDrive-open', '')">📂 Open S: Drive</button>
                            <button class="mgmt-btn" style="width:100%;" onclick="SharedDriveExt.refreshStats()">🔄 Force Refresh</button>
                        </div>
                    </div>
                </div>
            `;
            this.refreshStats();
        } else if (tab === 'settings') {
            main.innerHTML = `
                <div class="users-mgmt-header">
                    <h2>Sync & Security</h2>
                    <p>Configure how folders are shared across the team.</p>
                </div>
                <div class="mgmt-form-card" style="margin-top:20px; max-width:500px;">
                    <div class="mgmt-field">
                        <label>Sharing Content Folder</label>
                        <div style="display:flex; gap:10px;">
                            <input type="text" class="mgmt-input" id="sd-set-path" readonly style="flex:1; background:rgba(0,0,0,0.2); cursor:default;" />
                            <button class="mgmt-btn" onclick="SharedDriveExt.browseFolder()">Browse</button>
                        </div>
                        <p style="font-size:10px; color:var(--text-muted); margin-top:5px;">This folder will be shared on the network as ChatSys Drive.</p>
                    </div>
                    <div class="mgmt-field">
                        <label>Auto-Sync New Users</label>
                        <select class="mgmt-input" id="sd-set-autosync">
                            <option>Instant (On Registration)</option>
                            <option>Periodic (Every 5 mins)</option>
                            <option>Manual Only</option>
                        </select>
                    </div>
                    <div class="mgmt-field" style="display:flex; align-items:center; justify-content:space-between;">
                        <label>Enable Drive Letter (S:)</label>
                        <input type="checkbox" id="sd-set-drive" />
                    </div>
                    <div class="mgmt-field" style="display:flex; align-items:center; justify-content:space-between;">
                        <label>Pin to Quick Access</label>
                        <input type="checkbox" id="sd-set-pin" />
                    </div>
                    <button class="mgmt-btn" style="margin-top:20px; width:100%; justify-content:center;" onclick="SharedDriveExt.saveConfig()">
                        Save Configuration
                    </button>
                    <div id="sd-save-status" style="margin-top:10px; font-size:12px; text-align:center; display:none;"></div>
                </div>
            `;
            this.loadConfig();
        }
    },

    async browseFolder() {
        const path = await api.invoke('ext:sharedDrive-select-folder');
        if (path) {
            document.getElementById('sd-set-path').value = path;
        }
    },

    async loadConfig() {
        if (!window.myUsername) return;
        const config = await api.invoke('ext:sharedDrive-get-config', window.myUsername);
        if (config) {
            const pathEl = document.getElementById('sd-set-path');
            const autoSyncEl = document.getElementById('sd-set-autosync');
            const driveEl = document.getElementById('sd-set-drive');
            const pinEl = document.getElementById('sd-set-pin');
            
            if (pathEl) pathEl.value = config.customPath || '';
            if (autoSyncEl) autoSyncEl.value = config.autoSync;
            if (driveEl) driveEl.checked = config.enableDrive;
            if (pinEl) pinEl.checked = config.pinQuickAccess;
        }
    },

    async saveConfig() {
        if (!window.myUsername) {
            alert("No active user session found!");
            return;
        }
        const config = {
            username: window.myUsername,
            customPath: document.getElementById('sd-set-path').value,
            autoSync: document.getElementById('sd-set-autosync').value,
            enableDrive: document.getElementById('sd-set-drive').checked,
            pinQuickAccess: document.getElementById('sd-set-pin').checked
        };
        
        const status = document.getElementById('sd-save-status');
        if (status) {
            status.style.display = 'block';
            status.style.color = 'var(--accent)';
            status.textContent = 'Saving & Re-mounting...';
        }

        const res = await api.invoke('ext:sharedDrive-set-config', config);
        if (res.success) {
            if (status) {
                status.style.color = '#10b981';
                status.textContent = '✓ Configuration saved for ' + window.myUsername;
                setTimeout(() => { if (status) status.style.display = 'none'; }, 2000);
            }
            this.refreshStats(); // Update overview with new path stats
        }
    },

    async refreshStats() {
        if (!window.myUsername) return;
        const res = await api.invoke('ext:sharedDrive-list', window.myUsername);
        if (res.success) {
            const pathEl = document.getElementById('drive-local-path');
            const usageEl = document.getElementById('drive-usage-val');
            const countEl = document.getElementById('drive-folder-count');
            const folderList = document.getElementById('sd-user-folder-list');

            if (pathEl) pathEl.textContent = res.rootPath;
            if (countEl) countEl.textContent = res.files.filter(f => f.isDir).length + ' Users';
            
            let totalSize = 0;
            if (folderList) folderList.innerHTML = '';
            
            res.files.forEach(f => {
                totalSize += f.size;
                if (f.isDir && folderList) {
                    const item = document.createElement('div');
                    item.style = "background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px; text-align:center; cursor:pointer;";
                    item.onclick = () => api.invoke('ext:sharedDrive-open', f.name, window.myUsername);
                    item.innerHTML = `
                        <div style="font-size:20px; margin-bottom:5px;">📁</div>
                        <div style="font-size:11px; font-weight:600; overflow:hidden; text-overflow:ellipsis;">${f.name}</div>
                    `;
                    folderList.appendChild(item);
                }
            });
            if (usageEl) usageEl.textContent = (totalSize / 1024).toFixed(1) + ' KB';
        }
    }
};
window.sharedDriveExt = SharedDriveExt;
