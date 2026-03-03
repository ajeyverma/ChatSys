# ChatSys Architecture & Protocol

Welcome to the architectural documentation for **ChatSys**, a fault-tolerant GUI-based LAN communication system with automatic failover capabilities.

## 1. Network Topologies

### 1.1 Local Area Network Discovery (UDP)
ChatSys uses an aggressive, decentralized UDP beaconing protocol to ensure clients can find the Primary Server effortlessly without manual IP configuration.
- **Port**: `65430`
- **Method**: The Primary Server constantly blasts a `MSG_DISCOVERY` packet to the subnet's global IP (`255.255.255.255`) and the local loopback (`127.0.0.1`) every `2000ms`.
- **Payload**: The packet purely contains the specific port the server is actively listening for TCP connections on (default: `65432`).

### 1.2 Data Transmission (TCP)
The core messaging mechanism relies on raw TCP Socket connections utilizing pure stringified JSON frames split by newline delimiters (`\n`). 

## 2. Redundancy & Failover State
The system is built to maintain connectivity even if the host machine crashes.
- All subsequent instances that cannot bind the Primary TCP Server Port automatically revert to becoming Backup Servers/Clients.
- The `PrimaryServer` constantly transmits synchronization states to the backups.
- If a client or a backup detects the Primary has died (missed heartbeats), the Backup triggers a promotion race. The winner becomes the new Primary and begins its UDP broadcast immediately to sweep the orphaned clients back up.

## 3. Protocol Message Types
All communications follow a strict type:
- `JOIN` - Client identification.
- `CHAT` - Public group messages.
- `DM` - Private direct routing.
- `IMAGE` - Base64 encoded media blobs.
- `CLIENT_LIST` - Real-time synchronization of online members.
- `HB` - Server-to-server health heartbeat.
- `STATE_SYNC` - Propagation of database state to backup arrays.
- `DISCOVERY` - UDP Server discovery payload.
