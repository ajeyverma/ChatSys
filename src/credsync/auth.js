// ─── Authentication ───────────────────────────────────────────────────────────
// Local login verification + permission check (no network round-trip needed)
const db = require('./database');
const logger = require('../logger');

/** Verify username + password against local DB. Returns user object or null. */
function login(username, password) {
    const result = db.verifyLogin(username, password);
    if (!result) {
        logger.warn('AUTH', `Failed login for "${username}"`);
        return null;
    }
    logger.info('AUTH', `"${username}" authenticated (role: ${result.role})`);
    return result;
}

/** Check if a user has a specific permission (admins always pass). */
function hasPermission(user, permission) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

/** Check if user can perform write operations (admin role required). */
function canWrite(user) {
    return user && user.role === 'admin';
}

module.exports = { login, hasPermission, canWrite };


