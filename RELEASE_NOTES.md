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
