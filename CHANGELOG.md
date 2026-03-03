# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.1] - 2026-03-03

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