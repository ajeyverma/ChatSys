# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---
## [2.8.0] - 2026-03-13

### Added
- **Anonymous CLI Chatbox**: Introduced a brand new terminal-based chat environment accessible directly from the launcher.
- **Privacy Isolation Protocol**: Implemented a secondary `ANON_CHAT` protocol that completely isolates terminal users from the regular GUI chat.
- **Dynamic User Coloring**: Integrated a name-hashing algorithm to assign unique, consistent colors to different chat participants.
- **Personalized CLI Prompts**: Replaced generic prompts with a yellow-tinted `[User] >>` identifier for a more immersive terminal experience.
- **ASCII Brand Identity**: Added custom developer-branded ASCII art (Green Design, Red Name, Yellow Links) to the CLI welcome screen.
- **Advanced Screen Clearing**: Implemented `\x1b[3J` logic to wipe the entire scrollback buffer upon joining, ensuring a fresh session.
- **Optimized Terminal UX**: Engineered a specific line-overwrite mechanism (`logOwnMessage`) for the CLI to ensure a clean chat feed without visual ghosting.
- **Guest Role Logic**: Integrated server-side "Guest" validation that allows instant access while preventing username conflicts.
- **Improved Signal Handling**: Added explicit `SIGINT` (Ctrl+C) support for graceful CLI exits.
- **Single Instance Lock**: Restructured the CLI to prevent multiple simultaneous anonymous chat sessions per machine, ensuring focused communication.

### Changed
- **Launcher UX Refinement**: Removed manual Port entry fields for a cleaner UI and repositioned the "Anonymous Chatbox" button directly under the active login controls.
- **Visual Feedback**: Added a new terminal icon to the anonymous entry button and fixed server discovery notification logic.

---
## [2.7.0] - 2026-03-12

### Optimized
- **Startup Performance**: Implemented lazy-loading for core modules (`ChatClient`, `PrimaryServer`, `CredNode`) to significantly reduce initial application load time.
- **Resource Footprint**: Removed external CDN dependencies (Google Fonts, Lucide Icons) in favor of system fonts and inline SVGs, enabling faster rendering and offline capability.
- **App Size Reduction**: Deleted legacy `bin`, `docs`, and `scripts` directories along with unused documentation files to streamline the installation package.
- **Database Initialization**: Optimized the CredSync database startup sequence to prevent blocking the main UI thread.

### Changed
- **CLI Removal**: Completely removed the Command Line Interface (CLI) mode to focus exclusively on a premium GUI experience.
- **Centralized Logging**: Refactored the logging system for better reliability and safer early-boot initialization.
- **Default Administration**: Added an automatic `admin` user setup on first boot for immediate system access.

### Fixed
- **Race conditions**: Resolved a critical initialization race condition where the user list would occasionally appear empty on startup.
- **UI Consistency**: Standardized "YOU" tags in the user management list and matched iconography across all panels.

---
## [2.6.1] - 2026-03-12

### Added
- **Unified CLI Entry Point**: Improved the `chatsys` command to handle both CLI and GUI launches seamlessly.
- **Dedicated `bin` Folder**: Reorganized command-line scripts into a dedicated `bin` directory to avoid naming collisions with the main application executable.
- **Python-Style REPL**: Enhanced the interactive admin terminal with a version header and a familiar `>>>` prompt.
- **`chatsys gui` Command**: Added a specific command to launch the graphical interface from the terminal without holding the process (no terminal "wrapper").

### Changed
- **Enhanced PATH Management**: Updated the installer to add the new `bin` folder to the system PATH.
- **Uninstaller Cleanup**: The uninstaller now automatically removes ChatSys from the Windows system PATH, ensuring a clean removal.

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