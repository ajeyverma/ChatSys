# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.3] - 2026-03-04

### Added
- 

### Fixed
- 

### Changed
- 

## [2.1.0] - 2026-03-04

### Added
- **End-to-End Encryption (E2EE)**: RSA + AES-256-GCM hybrid encryption for all group messages and DMs.
- **Persistent Logging Engine**: Automatically captures all system, server, and encryption events to date-rotated files in `%APPDATA%\chatsys\logs`.
- **Secure Server DMs**: Fully encrypted communication channel between clients and the Server Admin console.

### Fixed
- **Encryption Relay**: Resolved a bug where relayed messages lost encryption metadata, showing as ciphertext to recipients.
- **Self-Decryption**: Implemented dual-key encryption (sender + recipient) to allow users to view their own sent private messages.
- **UI Privacy**: Filtered the internal "🖥️ Server" account from the client-side online user list.

### Changed
- **Refined Notifications**: Removed redundant "User Joined/Left" and "Auto-Hosting" system messages from the group chat feed to reduce clutter.
- **Connection Privacy**: Reconnection attempts and status updates are now strictly confined to the titlebar status pill.

## [2.0.0] - 2026-03-03

### Added
- **Architectural Overhaul**: Combined Client and Server into a single unified application. Each node can operate as both client and server.
- **Failover Logic**: Automatic Primary Server promotion and election mechanism within the LAN.
- **LAN Auto-Discovery**: Integrated UDP discovery allowing clients to automatically detect active servers.
- **Inno Setup Installers**: Installers for x86, x64, and ARM64 Windows architectures.
- **Documentation**: Added `ARCHITECTURE.md` and `DEPLOYMENT.md` to the `docs` folder.

### Changed
- Refactored core networking into `src/protocol.js` and `src/chatClient.js`.
- Moved server logic to `src/primaryServer.js`.
- Simplified `main.js` to manage the unified application lifecycle.

### Removed
- Removed the requirement for a standalone server-only process.

---

## [1.0.0] - 2026-03-02

### Added
- **Primary Server Mode**: Host LAN chat and manage client connections.
- **Backup Server Mode**: Automatic promotion upon primary failure detection.
- **Client Application**: Interface that connects to the active LAN server.
- **Automatic Failover**: Heartbeat-based client migration mechanism.
- **Group Chat** functionality.
- **Direct Messaging (DMs)** for private conversations.
- **Image Sharing** with inline preview support.
- **Image Lightbox** modal for zoom and download.
- **Unread Message Badges** in the sidebar.
- **Server Direct Messaging Console**.
- **Custom Dark UI** with responsive layout.
- **Windows Installer** built using `electron-builder`.

---

[2.0.0]: https://github.com/ajeyverma/ChatSys/compare/v1.0.0...v2.0.0  
[1.0.0]: https://github.com/ajeyverma/ChatSys/releases/tag/v1.0.0