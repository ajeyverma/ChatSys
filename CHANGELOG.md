# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---
## [2.6.0] - 2026-03-12

### Added
- **Integrated CLI**: The main executable now supports a standalone `--cli` flag for managing user accounts and database versioning without the GUI.
- **Command-Line Wrappers**: Added `chatsys` command utilities (.cmd/.ps1) to the root and installation directory.
- **Automatic PATH Registration**: The installer now automatically adds the ChatSys installation directory to the Windows System PATH.

### Changed
- **Username Display Migration**: All chat interfaces, including the online user list, group chat bubbles, and DM headers, now prioritize the **Full Name** instead of the UserID.
- **Standardized Shortcut Name**: Renamed the Start Menu shortcut from "ChatSys (64-bit)" to simply "**ChatSys**".

## [2.5.0] - 2026-03-11

### Added
- **Credential Sync CLI**: Added a new CLI tool for managing user credentials.

## [2.4.0]

### Changed
- **Theme Control Relocated**: Moved theme switcher out of the sidebar/config-panel into a dedicated titlebar button (🎨) on both the **Launcher** and **Client** windows.
  - Clicking the palette icon opens a compact animated dropdown with **System**, **Light**, and **Dark** theme options.
  - The button icon updates dynamically to reflect the currently active theme (🌗 / ☀️ / 🌙).
  - Dropdown auto-dismisses on outside click.

### Removed
- Removed the inline theme toggle buttons from the **Client** sidebar (bottom of the users panel).
- Removed the theme pill buttons (Default / Light / Dark) from the **Launcher** config panel.

---

## [2.3.0] 

### Added
- **Context Menu**: Right-click menu for messages with options to copy, reply, and quote.
- **Reply Feature**: Added reply functionality to messages.
- **Quote Feature**: Added quote functionality to messages.

### Fixed
- Fixed a bug where the context menu was not working.



## [2.2.1] - 2026-03-04

### Fixed
- Fixed a fatal crash in the main process (`TypeError: Cannot destructure property 'host' of 'undefined'`) when the client fails to connect on startup.
- Added robust error object passing in the `ChatClient` emission of `server-not-found`.


## [2.2.0] - 2026-03-04

### Added
- Comprehensive **Theming Engine** with support for Dark, Light, and System themes.
- Global **CSS Token System** (`themes.css`) for consistent styling across Launcher, Client, and Servers.
- **Theme Persistence**: User selection is saved to local storage and restored on startup.
- Interactive Theme Switchers:
  - Dedicated buttons in the Launcher.
  - Polished icon toggles (🌗 ☀️ 🌙) in the Client/Server sidebars.

### Fixed
- Migrated all legacy hardcoded color values to dynamic CSS variables.
- Refined UI contrast for better accessibility in both light and dark modes.

### Changed
- Major upgrade to internal UI architecture to support dynamic styling.
- Streamlined version synchronization for minor and patch releases.


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