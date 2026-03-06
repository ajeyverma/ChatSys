// ─── CredSync Database ────────────────────────────────────────────────────────
// SQLite via better-sqlite3 — credential CRUD, versioning, snapshot export/import
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

let DATA_DIR = path.join(process.cwd(), 'data');
let DB_PATH = path.join(DATA_DIR, 'credentials.db');
let db;

// ── Init ─────────────────────────────────────────────────────────────────────
function init(dataDir) {
    if (dataDir) {
        DATA_DIR = dataDir;
        DB_PATH = path.join(dataDir, 'credentials.db');
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      user_id       TEXT    PRIMARY KEY,
      username      TEXT    UNIQUE NOT NULL,
      full_name     TEXT    NOT NULL,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'user',
      permissions   TEXT    NOT NULL DEFAULT '[]',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      is_active     INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS db_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    INTEGER NOT NULL,
      action       TEXT    NOT NULL,
      target_user  TEXT,
      performed_by TEXT,
      node_id      TEXT,
      details      TEXT
    );
    CREATE TABLE IF NOT EXISTS approvals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT    NOT NULL,
      password     TEXT    NOT NULL,
      full_name    TEXT    NOT NULL DEFAULT 'User',
      status       TEXT    NOT NULL DEFAULT 'pending',
      created_at   INTEGER NOT NULL
    );
  `);

    try {
        db.exec("ALTER TABLE approvals ADD COLUMN full_name TEXT NOT NULL DEFAULT 'User'");
    } catch (e) { }

    try {
        db.exec("ALTER TABLE credentials ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");
    } catch (e) { }
    try {
        db.exec("ALTER TABLE credentials ADD COLUMN full_name TEXT NOT NULL DEFAULT 'Unknown'");
    } catch (e) { }

    if (!db.prepare("SELECT value FROM db_meta WHERE key='version'").get()) {
        db.prepare("INSERT INTO db_meta (key,value) VALUES (?,?)").run('version', '1');
        db.prepare("INSERT INTO db_meta (key,value) VALUES (?,?)").run('created_at', String(Date.now()));
    }
    return db;
}

// ── Versioning ────────────────────────────────────────────────────────────────
function getVersion() {
    const r = db.prepare("SELECT value FROM db_meta WHERE key='version'").get();
    return r ? parseInt(r.value) : 1;
}
function bumpVersion() {
    const next = getVersion() + 1;
    db.prepare("INSERT OR REPLACE INTO db_meta (key,value) VALUES ('version',?)").run(String(next));
    db.prepare("INSERT OR REPLACE INTO db_meta (key,value) VALUES ('last_updated',?)").run(String(Date.now()));
    return next;
}

// ── Audit ─────────────────────────────────────────────────────────────────────
function audit(action, target, by, nodeId, details) {
    db.prepare(`INSERT INTO audit_log (timestamp,action,target_user,performed_by,node_id,details)
              VALUES (?,?,?,?,?,?)`)
        .run(Date.now(), action, target, by, nodeId, details ? JSON.stringify(details) : null);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
function addUser(username, password, role = 'user', permissions = [], by = 'system', nodeId = '', mustChange = 0, fullName = 'User') {
    const user_id = uuidv4();
    const hash = bcrypt.hashSync(password, 12);
    const now = Date.now();
    db.prepare(`INSERT INTO credentials (user_id,username,full_name,password_hash,role,permissions,created_at,updated_at,is_active,must_change_password)
              VALUES (?,?,?,?,?,?,?,?,1,?)`)
        .run(user_id, username, fullName, hash, role, JSON.stringify(permissions), now, now, mustChange);
    audit('ADD_USER', username, by, nodeId, { role, permissions, mustChange, fullName });
    return { user_id, username, full_name: fullName, role, permissions, created_at: now, must_change_password: mustChange };
}

function deleteUser(username, by = 'system', nodeId = '') {
    const r = db.prepare("DELETE FROM credentials WHERE username=?")
        .run(username);
    if (r.changes) { audit('DELETE_USER', username, by, nodeId); return true; }
    return false;
}

function changePassword(username, newPassword, by = 'system', nodeId = '') {
    const hash = bcrypt.hashSync(newPassword, 12);
    const r = db.prepare("UPDATE credentials SET password_hash=?, must_change_password=0, updated_at=? WHERE username=? AND is_active=1")
        .run(hash, Date.now(), username);
    if (r.changes) { audit('CHANGE_PASSWORD', username, by, nodeId); return true; }
    return false;
}

function changeRole(username, newRole, permissions = null, by = 'system', nodeId = '') {
    const cur = db.prepare("SELECT * FROM credentials WHERE username=? AND is_active=1").get(username);
    if (!cur) return false;
    const perms = permissions !== null ? JSON.stringify(permissions) : cur.permissions;
    db.prepare("UPDATE credentials SET role=?, permissions=?, updated_at=? WHERE username=?")
        .run(newRole, perms, Date.now(), username);
    audit('CHANGE_ROLE', username, by, nodeId, { newRole });
    return true;
}

function renameRole(oldRole, newRole, by = 'system', nodeId = '') {
    const o = oldRole.trim();
    const n = newRole.trim().toLowerCase();
    const r = db.prepare("UPDATE credentials SET role=?, updated_at=? WHERE role=? COLLATE NOCASE")
        .run(n, Date.now(), o);
    if (r.changes > 0) {
        audit('RENAME_ROLE_GLOBAL', o, by, nodeId, { newRole: n, count: r.changes });
        return r.changes;
    }
    return 0;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function verifyLogin(username, password) {
    const u = db.prepare("SELECT * FROM credentials WHERE username=? AND is_active=1").get(username);
    if (!u || !bcrypt.compareSync(password, u.password_hash)) return null;
    return {
        user_id: u.user_id,
        username: u.username,
        full_name: u.full_name,
        role: u.role,
        permissions: JSON.parse(u.permissions),
        must_change_password: u.must_change_password
    };
}

// ── Queries ───────────────────────────────────────────────────────────────────
function getUser(username) {
    const u = db.prepare("SELECT user_id,username,full_name,role,permissions,created_at,updated_at,is_active FROM credentials WHERE username=?").get(username);
    return u ? { ...u, permissions: JSON.parse(u.permissions) } : null;
}
function listUsers(includeInactive = false) {
    const q = includeInactive
        ? "SELECT user_id,username,full_name,role,permissions,created_at,updated_at,is_active FROM credentials"
        : "SELECT user_id,username,full_name,role,permissions,created_at,updated_at,is_active FROM credentials WHERE is_active=1";
    return db.prepare(q).all().map(u => ({ ...u, permissions: JSON.parse(u.permissions) }));
}

// ── Snapshot Export / Import ─────────────────────────────────────────────────
function exportSnapshot() {
    const credentials = db.prepare("SELECT * FROM credentials").all();
    const meta = {};
    db.prepare("SELECT key,value FROM db_meta").all().forEach(r => { meta[r.key] = r.value; });
    const auditLog = db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 1000").all();
    return { meta, credentials, auditLog };
}

function importSnapshot({ meta, credentials, auditLog }) {
    db.transaction(() => {
        db.prepare("DELETE FROM credentials").run();
        for (const c of credentials) {
            db.prepare(`INSERT OR REPLACE INTO credentials
        (user_id,username,password_hash,role,permissions,created_at,updated_at,is_active)
        VALUES (?,?,?,?,?,?,?,?)`)
                .run(c.user_id, c.username, c.password_hash, c.role, c.permissions, c.created_at, c.updated_at, c.is_active);
        }
        for (const log of (auditLog || [])) {
            try {
                db.prepare(`INSERT OR IGNORE INTO audit_log (id,timestamp,action,target_user,performed_by,node_id,details)
                    VALUES (?,?,?,?,?,?,?)`)
                    .run(log.id, log.timestamp, log.action, log.target_user, log.performed_by, log.node_id, log.details);
            } catch { }
        }
        for (const [k, v] of Object.entries(meta)) {
            db.prepare("INSERT OR REPLACE INTO db_meta (key,value) VALUES (?,?)").run(k, v);
        }
    })();
}

// ── Approvals ────────────────────────────────────────────────────────────────
function isUsernameTaken(username) {
    const inCreds = db.prepare("SELECT 1 FROM credentials WHERE username = ?").get(username);
    if (inCreds) return true;
    const inApprovals = db.prepare("SELECT 1 FROM approvals WHERE username = ? AND status = 'pending'").get(username);
    return !!inApprovals;
}

function addApprovalRequest(username, password, fullName = 'User') {
    db.prepare("INSERT INTO approvals (username, password, full_name, created_at) VALUES (?, ?, ?, ?)")
        .run(username, password, fullName, Date.now());
}
function listApprovals() {
    return db.prepare("SELECT * FROM approvals WHERE status = 'pending'").all();
}
function approveRequest(id, by, nodeId) {
    const req = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
    if (!req) return false;
    addUser(req.username, req.password, 'user', [], by, nodeId, 0, req.full_name); // Self-applied IDs don't MUST change
    db.prepare("UPDATE approvals SET status = 'approved' WHERE id = ?").run(id);
    return true;
}
function rejectRequest(id) {
    const r = db.prepare("UPDATE approvals SET status = 'rejected' WHERE id = ?").run(id);
    return r.changes > 0;
}

module.exports = {
    init, getVersion, bumpVersion,
    addUser, deleteUser, changePassword, changeRole,
    verifyLogin, getUser, listUsers,
    exportSnapshot, importSnapshot,
    addApprovalRequest, listApprovals, approveRequest, rejectRequest, isUsernameTaken,
    renameRole
};


