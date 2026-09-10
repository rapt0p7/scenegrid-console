## Why

We need to allow external authoring tools, DAWs, and MCP servers to connect to the running SceneGrid AudioEngine to inspect its state, receive telemetry, and send live property updates (Live Bridge). Currently, the Telemetry and Command systems are hardcoded to communicate over a `MessagePort` to a local Web Worker, which prevents remote or out-of-process debugging and authoring.

## What Changes

- Implement a `WebSocketLiveBridge` infrastructure module.
- The Engine (specifically its `TelemetryWorker`) will act as a WebSocket Client, connecting to a specified remote server (e.g., `ws://localhost:8080`).
- The `TelemetryWorker` will manage the WebSocket connection lifecycle.
- **Handshake**: Upon successful connection (`ws.onopen`), the Worker will immediately perform a Full Sync by sending the latest complete state dump to instantly synchronize late-connecting tools.
- **Streaming**: The Worker will forward the 10Hz telemetry updates via JSON over the WebSocket.
- **Command Proxying**: The Worker will listen for incoming `InspectorCommand` JSON payloads (`ws.onmessage`) and proxy them to the main thread's `CommandReceiver` via the existing `MessagePort`.
- The main AudioEngine thread remains completely isolated from network logic.

## Capabilities

### New Capabilities
- `telemetry/live-bridge`: WebSocket-based remote connection for telemetry broadcast and remote command reception.

### Modified Capabilities
<!-- No core requirements changing -->

## Impact

- **Architectural Layer**: **Infrastructure** layer (and the Shared Worker).
- **Domain Isolation**: The dependency rule (inward to Domain) remains entirely unbroken. The Domain layer is completely unaware of WebSockets. The Infrastructure layer handles the connection, while the existing `IInspectorDebugPort` and `ITelemetryTransport` interfaces remain unchanged.
- **Networking**: Requires external tools to host a WebSocket server.
- **Payloads**: JSON serialization over WebSockets (prioritizing human-readability and debuggability at 10Hz).
