# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-02

### Added
- **Primary Server Mode:** Ability to host the LAN chat and manage initial client connections.
- **Backup Server Mode:** Auto-promotes to primary server upon detecting failover, ensuring continuous uptime.
- **Client Application:** Lightweight client interface linking automatically to whatever server is currently active on the LAN.
- **Automatic Failover:** Heartbeat detection gracefully migrates all connected clients to the Backup Server if the Primary Server crashes.
- **Group Chat:** Global chat room for all connected users to broadcast messages.
- **Direct Messaging (DMs):** Private 1-on-1 conversations between connected clients without cluttering the global feed.
- **Image Sharing:** Send, view, and reply to image attachments inline with text chats.
- **Image Lightbox:** Zoom, download, and reply to images through a dedicated pop-up modal.
- **Unread Message Badges:** Visual indicators on the sidebar tracking missed direct messages.
- **Server DM'ing:** The server has a dedicated chat console that allows the administrator to send and receive direct messages.
- **Custom UI:** Dark mode developer-friendly interface featuring dynamic window resizing, flex-box layout, and VS Code-inspired titlebar controls.
- **Windows Installer:** Automated `.exe` release built using `electron-builder`.
