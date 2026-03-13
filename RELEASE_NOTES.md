# Release Notes v2.8.0 - Premium GUI Anonymous Chat

## Secure, Instant, and Beautiful

This major update introduces the **Premium GUI Anonymous Chatbox**, a modern, login-free communication interface built for instant LAN privacy. Moving beyond terminal limits, this release brings a high-fidelity graphical experience featuring glassmorphism, end-to-end encryption visibility, and full theme synchronization.

---

## What’s Changed

*   Reimagined the anonymous chat as a high-fidelity **GUI experience**.
*   Added a dedicated **Theme Picker** and Identity Badge to the titlebar.
*   Implemented **E2EE Visibility** indicators for all messages.
*   Enforced **Privacy Hardening** by redacting plaintext messages from terminal logs.
*   Refined **Message Layouts** with auto-scaling bubbles and optimized spacing.

---

## Key Enhancements

### Premium GUI Chatbox
A dedicated, high-performance chat window accessible directly from the launcher. Join the conversation instantly with a beautiful, theme-aware interface that matches the premium ChatSys aesthetic.

### Titlebar-Integrated Identity
The new titlebar now displays your persistent display name in a bold, green-accented badge. It also houses an intuitive theme switcher for toggling between Light, Dark, and System modes.

### End-to-End Encryption Visibility
Your conversation is protected by RSA+AES-256-GCM encryption.

---

## Technical Improvements

*   Resolved critical client initialization race conditions.
*   Redacted plaintext message content from all backend logs.
*   Optimized chat history renderer.
*   Refined server discovery logic for faster automatic IP resolution.

---

## Contributors

**@ajeyverma**  
Founder & Lead Developer  
Architect of the Premium GUI Anonymous Chat and E2EE Privacy Hardening.

---

# Release Notes v2.7.0 - Performance & Optimization

## Streamlining Core Systems

This release focuses on making ChatSys faster, lighter, and more reliable by optimizing internal modules and removing external weight.

---

## What’s Changed

*   Implemented lazy-loading for core application modules.
*   Removed all external CDN dependencies.
*   Standardized "YOU" tags and iconography across the UI.
*   Refactored the logging system for early-boot stability.

---

## Key Enhancements

### Startup Performance
Module lazy-loading significantly reduces initial application load time, ensuring the launcher and client windows open faster than ever.

### Zero-External Footprint
By migrating Google Fonts and Lucide Icons to system-local alternatives and inline SVGs, ChatSys is now 100% offline-ready with no external pings required.

---

## Technical Improvements

*   Optimized CredSync database startup sequence.
*   Reduced installer package size by cleaning legacy directories.
*   Fixed critical race conditions in the user list initialization.

---

# Release Notes v2.6.0 & v2.6.1 - System Integration

## CLI Mastery and PATH Support

This version establishes ChatSys as a first-class citizen in the Windows environment, introducing deep system integration and professional command-line tools.

---

## What’s Changed

*   Added unified `chatsys` entry point for CLI and GUI.
*   Implemented automatic Windows PATH registration.
*   Migrated all chat interfaces to prioritize Full Names over UserIDs.
*   Added dedicated `bin` folder for binary utilities.

---

## Key Enhancements

### Unified Command-Line Interface
The `chatsys` command now acts as a versatile tool. Use it to launch the interactive management REPL or start the GUI directly from the terminal.

### Automatic System PATH Support
The installer now automatically registers the installation directory to the system environment, allowing you to type `chatsys` in any terminal or PowerShell window.

---

## Technical Improvements

*   Enhanced interactive REPL with a Python-style `>>>` prompt.
*   Added standalone `--cli` flag for account management.
*   Improved uninstaller cleanup for environment variables.

---

# Release Notes v2.3.0 - v2.5.0 - UI Polish & Interactions

## Refining the User Experience

These updates focus on message interaction, credential management, and titlebar-integrated theme controls.

---

## What’s Changed

*   Moved theme switcher to a dedicated titlebar palette icon.
*   Added right-click context menus for chat messages.
*   Introduced Credential Sync CLI tool.
*   Integrated Reply and Quote functionality.

---

## Key Enhancements

### Advanced Message Interactions
Right-click any message to Copy, Reply, or Quote. Replies are clearly threaded, making complex conversations easier to follow.

### Dynamic Theme Palette
The theme switcher has been moved from the sidebar to a compact animated dropdown in the titlebar, featuring dynamic icons that reflect the active mode.

---

# Release Notes v2.2.1
 
This update fixes a critical crash that occurred when the client could not initialy find a server on start-up.
 
## What’s New
 
* **Stability Fix**: Resolved `TypeError: Cannot destructure property 'host' of 'undefined'` in the main process when connections are refused.
* **Improved Error Handling**: More robust error reporting when the backend auto-hosting is triggered.
 
---
 
# Release Notes v2.2.0
 
This release introduces a major UI overhaul with a comprehensive **Theming System**. Users can now select and persist their visual preference between Dark, Light, and System themes for a personalized experience.
 
## What’s New
 
* **Dynamic Theme Selection**: Choose between Dark, Light, and System modes. 
* **Global CSS Tokens**: Unified styling across Launcher, Client, and Server consoles.
* **Theme Persistence**: Settings are saved locally and persist across application restarts.
* **System Sync**: The Default theme automatically mirrors your OS (Windows/macOS) preferences.
* **Enhanced Visuals**: Migrated all legacy colors to dynamic CSS variables for 100% theme support.
 
---
 
# Release Notes v2.1.0 - Security & Persistence
 
This update significantly upgrades the privacy model and stability of ChatSys, ensuring all data is secure on the wire and system events are tracked for troubleshooting.
 
## What’s New
 
* **End-to-End Encryption (E2EE)**: Hybrid RSA/AES-256-GCM encryption is now active for all messages and images.
* **Persistent Logging**: The app now maintains detailed daily logs in `%APPDATA%\chatsys\logs`, making it easy to troubleshoot network issues or server failovers.
* **Fixed Encryption Echoes**: Resolved the issue where sent messages would appear as encrypted blobs to the sender; they are now correctly decrypted for all participants.
* **Streamlined UI**: Hidden administrative server identities from the user list and silenced redundant system notifications.
 
---
 
# Release Notes v2.0.0

## Major Architectural Upgrade

ChatSys v2.0.0 introduces a significant architectural redesign, transforming the application from a traditional client-server model into a unified, self-managing LAN communication system.

This release removes the dependency on a dedicated server and introduces automatic discovery and failover capabilities to improve reliability and usability.

---

## What’s Changed

* Implemented integrated chat client UI
* Added automatic LAN peer discovery (UDP-based)
* Introduced automatic primary server assignment
* Eliminated the need for a separate server application
* Unified client and server into a single executable

Full Changelog:
[https://github.com/ajeyverma/ChatSys/compare/v1.0.0...v2.0.0](https://github.com/ajeyverma/ChatSys/compare/v1.0.0...v2.0.0)

---

## Key Enhancements

### Unified Client–Server Architecture

Each ChatSys instance can dynamically operate as a Primary Server, Backup Node, or Client. No manual server setup is required.

### Automatic Failover

If the active Primary Server goes offline, remaining nodes automatically coordinate and promote a new Primary, ensuring continuous availability within the LAN.

### Zero-Configuration LAN Discovery

Built-in UDP-based discovery automatically detects peers and active servers on the local network. Manual IP configuration is no longer necessary.

### Windows Installer Support

* Dedicated Windows installer packages
* ARM64 support for modern Windows devices
* x86 build for standard systems
* Installer built using Inno Setup

---

## Technical Improvements

* Centralized protocol handling for improved stability
* Dynamic runtime role switching
* Refactored networking layer
* Improved connection handling and synchronization
* Updated project documentation in `/docs`

---

## Breaking Changes

* The legacy v1.x separate client/server architecture is deprecated
* v1.x nodes are not compatible with v2.0.0

---

## Contributors

This release was built and engineered by:

**@ajeyverma**  
Founder & Lead Developer  
Architect of the new self-managing LAN communication system powering ChatSys v2.0.0

# Release Notes v1.0.0 

## Initial Release – Fault-Tolerant LAN Messaging System

ChatSys v1.0.0 introduces a resilient LAN-based communication platform designed for offline-ready local network messaging.

This version establishes the foundation of a fault-tolerant client–server architecture with automatic failover capabilities and a modern desktop user interface.

---

## What’s Included

### Primary–Backup Server Architecture

* Dedicated **Primary Server Mode** to host and manage LAN communication.
* **Backup Server Mode** capable of automatic promotion upon primary server failure.
* Heartbeat-based health monitoring between nodes.

### Automatic Failover

* Clients automatically reconnect to the promoted backup server.
* Designed to minimize disruption during primary server outages.

### Messaging Capabilities

* **Group Chat** for LAN-wide communication.
* **Direct Messaging (DMs)** for private 1-to-1 conversations.
* **Image Sharing** with inline previews.
* **Image Lightbox Modal** for zoom, download, and quick reply.
* **Unread Message Indicators** for direct message tracking.
* **Server Direct Messaging Console** for administrative communication.

### User Interface

* Custom dark-themed desktop interface.
* Dynamic window resizing and responsive layout.
* Native-style window controls (minimize, maximize, close).
* Developer-oriented aesthetic.

---

## Technical Overview

* Electron-based desktop application.
* Separate client and server runtime processes.
* Heartbeat-based failover detection.
* LAN IPv4 communication support.

---

## Known Limitations

* IPv4 LAN networks only.
* No external WAN support.
* File sharing limited to images.
* Separate server process required.

---

## Contributors

This release was built and engineered by:

**@ajeyverma**  
Founder & Lead Developer  
Architect of the original fault-tolerant LAN communication system powering ChatSys v1.0.0





