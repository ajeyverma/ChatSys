/* 🔐 User Management Logic */

window.MgmtManager = {
    currentTab: 'accounts',
    allUsers: [], // Cache for filtering

    init() {
        console.log("MgmtManager initialized");
    },

    setTab(tab) {
        this.currentTab = tab;
        // Update UI
        document.querySelectorAll('.mgmt-side-item').forEach(el => el.classList.remove('active'));
        const activeItem = document.querySelector(`.mgmt-side-item[onclick*="${tab}"]`);
        if (activeItem) activeItem.classList.add('active');

        document.querySelectorAll('.mgmt-content-pane').forEach(el => el.classList.remove('active'));
        const activePane = document.getElementById(`pane-${tab}`);
        if (activePane) activePane.classList.add('active');

        if (tab === 'accounts') {
            const searchInp = document.getElementById('mgmt-user-search');
            if (searchInp) searchInp.value = '';
            this.loadUserList();
        } else if (tab === 'approvals') {
            this.loadApprovals();
        }

        // Refresh icons for the newly active pane
        if (window.lucide) window.lucide.createIcons();
    },

    async loadUserList() {
        const container = document.getElementById('mgmt-user-list');
        const totalLabel = document.getElementById('mgmt-total-users');
        if (!container) return;

        container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--mgmt-text-muted); font-size:12px;">Connecting to database node...</div>';

        try {
            this.allUsers = await window.api.invoke('admin:list-users');
            this.renderUsers(this.allUsers);

            if (totalLabel) totalLabel.textContent = this.allUsers.length;

            // Update progress bar for Total Registered (assume 50 as soft limit)
            const progress = Math.min((this.allUsers.length / 50) * 100, 100);
            const pb = document.querySelector('#pane-accounts .progress-bar');
            if (pb) pb.style.width = `${progress}%`;

        } catch (err) {
            container.innerHTML = `<div style="color:#f43f5e; font-size:12px; padding:40px;">Connection Error: ${err.message}</div>`;
        }
    },

    filterUsers(query) {
        if (!query) return this.renderUsers(this.allUsers);
        const q = query.toLowerCase();
        const filtered = this.allUsers.filter(u =>
            u.username.toLowerCase().includes(q) ||
            u.role.toLowerCase().includes(q) ||
            (u.is_active ? 'active' : 'offline').includes(q)
        );
        this.renderUsers(filtered);
    },

    renderUsers(users) {
        const container = document.getElementById('mgmt-user-list');
        if (!container) return;
        container.innerHTML = '';

        if (users.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--mgmt-text-muted); font-size:12px;">No users found matching your search.</div>';
            return;
        }

        users.forEach(u => {
            const isMe = u.username === window.myUsername;
            const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString() : '15/02/2026';

            const row = document.createElement('div');
            row.className = 'user-mgmt-row';
            row.innerHTML = `
                <div class="row-username" style="flex:1.5;">
                    ${u.full_name || u.username} ${isMe ? '<span class="me-tag">IT</span>' : ''}
                </div>
                <div class="row-userid" style="flex:1; font-size:12px; color:var(--mgmt-text-muted); font-family:monospace;">
                    ${u.username}
                </div>
                <div class="row-role">
                    <span class="role-pill ${u.role === 'admin' ? 'admin' : 'member'}">
                        ${u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                    </span>
                </div>
                <div class="row-created">
                    ${dateStr}
                </div>
                <div class="user-row-btns">
                    ${!isMe ? `
                        <button class="icon-btn delete" onclick="MgmtManager.deleteUser('${u.username}')" title="Delete">
                            <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                        </button>
                    ` : ''}
                </div>
            `;
            container.appendChild(row);
        });

        // Initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
    },

    async deleteUser(username) {
        if (!confirm(`Permanently delete account "${username}"? This cannot be undone.`)) return;
        await window.api.invoke('admin:delete-user', { username });
        this.loadUserList();
    },

    async changePass(username) {
        const newPass = prompt(`New password for ${username}:`);
        if (!newPass) return;
        await window.api.invoke('admin:change-password', { username, password: newPass });
        alert('Password updated.');
    },

    async createAccount() {
        const fullInp = document.getElementById('mgmt-new-fullname');
        const userInp = document.getElementById('mgmt-new-user');
        const passInp = document.getElementById('mgmt-new-pass');
        const roleInp = document.getElementById('mgmt-new-role');
        const errEl = document.getElementById('mgmt-new-error');

        const fullName = fullInp.value.trim();
        const username = userInp.value.trim();
        const password = passInp.value.trim();
        const role = roleInp.value;

        if (!username || !password || !fullName) {
            errEl.textContent = "All fields are required.";
            errEl.style.display = 'block';
            return;
        }

        const res = await window.api.invoke('admin:add-user', { username, password, role, fullName });
        if (res.success) {
            userInp.value = '';
            passInp.value = '';
            errEl.style.display = 'none';
            alert(`Account ${username} created!`);
            this.setTab('accounts');
        } else {
            errEl.textContent = res.error;
            errEl.style.display = 'block';
        }
    },

    async loadApprovals() {
        const pane = document.getElementById('pane-approvals');
        const content = pane.querySelector('.users-mgmt-content');
        if (!content) return;

        try {
            const list = await window.api.invoke('admin:list-approvals');
            if (list.length === 0) {
                content.innerHTML = `
                    <div class="mgmt-table-wrap" style="padding:60px; text-align:center; color:var(--mgmt-text-muted);">
                        <div style="margin-bottom:20px; opacity:0.5;">
                            <i data-lucide="clipboard-list" style="width:48px; height:48px;"></i>
                        </div>
                        <div style="font-weight:600; font-size:14px; color:var(--mgmt-text-main);">No Pending Approvals</div>
                        <div style="font-size:12px; margin-top:8px;">New registration requests will appear here for review.</div>
                    </div>
                `;
            } else {
                let html = `<div class="mgmt-table-wrap"><div class="mgmt-table-header">
                    <div style="flex:1;">UserID</div>
                    <div style="flex:1.5;">Full Name</div>
                    <div style="flex:1;">Requested On</div>
                    <div style="width:160px; text-align:right;">Actions</div>
                </div><div id="approval-list-body">`;

                list.forEach(req => {
                    const date = new Date(req.created_at).toLocaleString();
                    html += `
                        <div class="user-mgmt-row" style="font-size:13px;">
                            <div style="flex:1; font-family:monospace; color:var(--mgmt-text-muted);">${req.username}</div>
                            <div style="flex:1.5; font-weight:600; color:var(--mgmt-text-main);">${req.full_name || 'Unknown'}</div>
                            <div style="flex:1; color:var(--mgmt-text-dim); font-size:11px;">${date}</div>
                            <div style="width:160px; display:flex; gap:8px; justify-content:flex-end; align-items:center;">
                                <button class="mgmt-btn" onclick="MgmtManager.approveRequest(${req.id})" style="padding:4px 12px; font-size:11px; background:var(--mgmt-accent); color:white;">Approve</button>
                                <button class="mgmt-btn" onclick="MgmtManager.rejectRequest(${req.id})" style="padding:4px 12px; font-size:11px; background:rgba(239, 68, 68, 0.1); border-color:rgba(239, 68, 68, 0.2); color:#ef4444;">Reject</button>
                            </div>
                        </div>
                    `;
                });
                html += `</div></div>`;
                content.innerHTML = html;
            }
            if (window.lucide) window.lucide.createIcons();
        } catch (e) {
            content.innerHTML = `<div style="color:#f43f5e; padding:40px;">Error: ${e.message}</div>`;
        }
    },

    async approveRequest(id) {
        const res = await window.api.invoke('admin:approve-request', { id });
        if (res.success) {
            alert('Request approved! User added to system.');
            this.loadApprovals();
        } else {
            alert('Failure: ' + res.error);
        }
    },

    async rejectRequest(id) {
        if (!confirm('Reject this registration request?')) return;
        const res = await window.api.invoke('admin:reject-request', { id });
        if (res.success) {
            this.loadApprovals();
        } else {
            alert('Failure: ' + res.error);
        }
    }
};
