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





