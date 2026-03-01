// Shared configuration constants
module.exports = {
  PRIMARY_HOST: '0.0.0.0',
  PRIMARY_PORT: 65432,        // TCP: client connections to primary
  BACKUP_PORT: 65433,         // TCP: backup's server port after promotion  
  HEARTBEAT_PORT: 65431,      // UDP: heartbeat channel primary -> backup
  HEARTBEAT_INTERVAL: 5000,   // ms: primary sends heartbeat every 5s
  HEARTBEAT_TIMEOUT: 10000,   // ms: backup promotes after 10s silence (2 missed beats)
  STATE_SYNC_INTERVAL: 8000,  // ms: primary syncs client list to backup
  BUFFER_SIZE: 4096,
  MAX_USERNAME_LEN: 24,
  RECONNECT_DELAY: 2000,      // ms: client waits before retry
  RECONNECT_ATTEMPTS: 5
};
