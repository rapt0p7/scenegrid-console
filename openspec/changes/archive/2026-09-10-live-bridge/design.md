## Context

The SceneGrid AudioEngine currently uses a `MessagePort` to communicate with a `TelemetryWorker`. This worker accumulates state and provides data to the local Inspector UI. To support external tools (DAWs, MCP servers), we need to adapt this flow to work over WebSockets, as outlined in `proposal.md`.

## Goals / Non-Goals

**Goals:**
- Enable the `TelemetryWorker` to initiate a WebSocket connection to a remote server.
- Seamlessly proxy `InspectorCommand` payloads from the WebSocket to the main thread.
- Provide instant synchronization for late-connecting remote tools using the worker's accumulated state.

**Non-Goals:**
- Modifying the core AudioEngine or Domain layers to be aware of WebSockets.
- Running a WebSocket server inside the browser (impossible/anti-pattern).
- Implementing binary serialization for telemetry data (we will stick to JSON for now).

## Decisions

### 1. TelemetryWorker as the WebSocket Client
The `TelemetryWorker` will manage the `WebSocket` connection lifecycle instead of the main thread.
- **Rationale**: Keeps network I/O off the main thread, preserving audio and UI performance. The worker already accumulates the engine's full state, making it the perfect place to handle the initial sync handshake without bothering the engine.
- **Alternatives Considered**: Putting the WebSocket on the main thread. Rejected because it would duplicate state tracking and risk blocking the main thread.

### 2. Full Sync Handshake Mechanism
Upon a successful WebSocket connection (`onopen`), the worker will immediately emit a `FULL_SYNC` payload containing its currently accumulated state.
- **Rationale**: External tools (like DAWs or MCP servers) might connect *after* the engine has been running. They need an immediate snapshot of the world (active playbacks, RTPC values, bus gains) to render their UIs correctly. The worker already holds this state, so this is a zero-cost operation for the engine.
- **Alternatives Considered**: Requesting a fresh snapshot from the main thread. Rejected because it introduces async latency and unnecessary main-thread overhead.

### 3. Command Proxying via Existing MessagePort
Incoming WebSocket messages (`onmessage`) will be parsed as JSON. If they represent an `InspectorCommand`, the worker will send them over its existing `MessagePort` to the main thread.
- **Rationale**: The main thread already has a `CommandReceiver` that listens to this `MessagePort` and applies commands via the `IInspectorDebugPort`. By reusing this path, the core AudioEngine requires absolutely zero changes to support remote commands.
- **Alternatives Considered**: Creating a new dedicated port or API for remote commands. Rejected because it violates our goal of minimizing changes to the existing architecture.

### 4. JSON Payload Format
We will serialize telemetry and commands as plain JSON strings over the WebSocket.
- **Rationale**: The engine currently emits telemetry at 10Hz (every 100ms). Modern V8 JSON serialization is extremely fast, and the data volume is manageable. JSON allows developers to use standard browser Network tabs to inspect frames easily.
- **Alternatives Considered**: Custom binary packing or Protobufs. Rejected as premature optimization.

## Risks / Trade-offs

- **[Risk] Connection Drops**: The WebSocket might disconnect unexpectedly.
  - **Mitigation**: Implement a basic exponential backoff reconnection loop inside the `TelemetryWorker`.
- **[Risk] Network Latency**: Remote commands will incur network latency compared to local Inspector commands.
  - **Mitigation**: Acceptable trade-off. The Live Bridge is intended for authoring, debugging, and MCP integration, not for frame-perfect musical performances.
