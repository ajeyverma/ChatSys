# ChatSys 💬

ChatSys is a **fault-tolerant, GUI-based LAN communication system** designed for seamless chatting across a local area network. It features **Automatic Failover**, which ensures that if the Primary Server goes down, a Backup Server automatically takes over to maintain connectivity for all participants.

## Key Features

-   **Automatic Failover**: Real-time server monitoring and automatic promotion of backup nodes.
-   **Direct Messaging**: Secure 1-on-1 private messaging between users.
-   **Group Chat**: Open broadcast channels for everyone on the network.
-   **Image Sharing**: Share images directly in the chat with a mini thumbnail and high-resolution preview.
-   **Modern UI**: Sleek, theme-aware interface with both Light and Dark modes.
-   **Anonymous CLI Chatbox**: High-performance terminal interface for instant, login-free communication.
-   **Cross-Platform**: Built on Electron, ensuring compatibility across various operating systems.

## Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (Recommended version: 18.x or later)
-   [npm](https://www.npmjs.com/)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-repo/ChatSys.git
    cd ChatSys
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### Running the Application

To start ChatSys in development mode:
```bash
npm start
```

### Building the Project

We use `electron-builder` to create production installers. Use one of the following commands:

-   **x64 Build**: `npm run build:x64`
-   **x86 Build**: `npm run build:x86`
-   **ARM64 Build**: `npm run build:arm64`

## Project Architecture

-   `main.js`: The Electron main process controller.
-   `src/`: Contains core server (`primaryServer.js`, `backupServer.js`) and client (`chatClient.js`) logic.
-   `renderer/`: Frontend assets (`client.html`, `primary.html`, `backup.html`) for the user interfaces.
-   `assets/`: Static assets such as icons and images.

## Documentation

For detailed information on the system's inner workings, check the [docs/](./docs/) directory.

-   [Architecture Overview](./docs/architecture.md)
-   [API Reference](./docs/api.md)

## Contributing

Contributions are welcome! Please see our [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Code of Conduct

We are committed to a welcoming and inclusive environment. Please read our [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

This project is proprietary software. See the [LICENSE](./LICENSE) and [EULA](./EULA) files for details.

## Version

Current Version: **2.8.0**
