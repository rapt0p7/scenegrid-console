# telemetry/live-bridge Specification

## Purpose
Provides a real-time remote connection for telemetry broadcast and remote command reception to allow external authoring tools to synchronize with the SceneGrid Engine.

## Requirements

### Requirement: Engine establishes remote synchronization connection
The Telemetry Worker SHALL act as a WebSocket client and establish a connection to a specified remote server URI when configured to do so.

#### Scenario: Successful connection and full sync
- **GIVEN** the Telemetry Worker is configured with a valid `remoteSyncUri`
- **WHEN** the worker successfully connects to the WebSocket server
- **THEN** it immediately sends a `FULL_SYNC` payload containing the latest known state dump of the engine

### Requirement: Engine streams telemetry data
The Telemetry Worker SHALL forward telemetry updates to the connected remote server via JSON payloads.

#### Scenario: Telemetry tick stream
- **GIVEN** the Live Bridge WebSocket is connected
- **WHEN** the engine dispatches a telemetry snapshot or event
- **THEN** the Telemetry Worker serializes it to JSON and sends it over the WebSocket

### Requirement: Engine receives remote commands
The Telemetry Worker SHALL listen for JSON-serialized commands on the WebSocket connection and proxy them back to the engine's main thread.

#### Scenario: Remote command execution
- **GIVEN** the Live Bridge WebSocket is connected
- **WHEN** the remote server sends a valid JSON `InspectorCommand` payload (e.g., `APPLY_SNAPSHOT`, `SET_RTPC`)
- **THEN** the Telemetry Worker proxies it to the `CommandReceiver` via the existing `MessagePort`
- **AND THEN** the engine applies the command locally without distinguishing it from local Inspector commands
