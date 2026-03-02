# ChatSys v1.0.0 Release Notes

Welcome to the initial release of **ChatSys (v1.0.0)**! 🎉

ChatSys is a fault-tolerant, GUI-based LAN communication system designed for resilient, offline-ready local network messaging. It features automatic failover capabilities, ensuring that your team's communication remains uninterrupted even if the primary host goes down.

## ✨ Key Features

### Robust Server Architecture
* **Primary & Backup Server Modes:** Deploy a Primary Server to host the chat, and a Backup Server that automatically promotes itself and takes over if the primary fails.
* **Automatic Failover:** Clients transparently reconnect to the backup server with zero data loss during a primary server outage.
* **Network Status Heartbeats:** Built-in health checks monitor connection integrity in real-time.

### Messaging & Collaboration
* **Group & Private Chatting:** Communicate with everyone on the network simultaneously, or click on a user's name to drop into a secure, private DM thread pane.
* **Image Sharing:** Easily send and receive image attachments in both group chats and direct messages.
* **Inline Image Lightbox:** Click on any image to zoom in, view details, download, or reply directly to the attachment.
* **Real-time Unread Badges:** Keep track of missed direct messages with dynamic notification dots in the sidebar.

### Premium User Interface
* **Sleek Dark Mode:** A polished, modern interface optimized for developer workflows, built with a deep-purple and neon accent color palette.
* **Window Controls:** Native-feeling maximize, minimize, and close titlebar controls that blend seamlessly into the application aesthetic.
* **Responsive Layout:** Dynamic UI elements that gracefully resize and pin to the bottom so your messages are always in view.

## 🛠️ Installation

1. Download the latest `ChatSys Setup 1.0.0.exe`
2. Run the installer to unpack the application to your Windows machine.
3. Open **ChatSys** from your Start Menu.
4. Choose your role: **Primary Server**, **Backup Server**, or **Client** to begin communicating over your LAN!

## 🐛 Known Issues & Limitations
* Currently restricted to IPv4 LAN networks. 
* Direct peer-to-peer file sharing (outside of images) is planned for a future update.

