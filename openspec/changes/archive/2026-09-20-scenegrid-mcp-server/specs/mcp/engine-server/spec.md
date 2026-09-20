## Purpose

Provides an MCP server that enables AI assistants to scaffold valid SceneGrid configurations and inspect live engine state via a WebSocket telemetry bridge.

## ADDED Requirements

### Requirement: Static Configuration Validation
The MCP Server SHALL provide a tool to validate the configuration directory using the engine's `ConsistencyChecker`.

#### Scenario: Agent requests validation of new configuration
- **WHEN** the LLM calls `validate_configurations(directory)`
- **THEN** the MCP server imports `@scene-grid/engine`, runs `ConsistencyChecker.validate`, and returns an array of errors and warnings.

### Requirement: Live Telemetry Bridge connection
The MCP Server SHALL start a WebSocket Server and rely on the engine's `TelemetryWorker` connecting to it (via `remoteSyncUri` configuration) to maintain an in-memory replica of the engine's latest state.

#### Scenario: TelemetryWorker pushes snapshot
- **WHEN** the engine's worker sends a `FULL_SYNC` or continuous `SNAPSHOT` messages to the WebSocket
- **THEN** the MCP server updates its internal state representing active playbacks, buses, and RTPC values.

### Requirement: Runtime Debugging Execution
The MCP Server SHALL provide tools that dispatch standard `InspectorCommand` JSON payloads over the WebSocket to the engine.

#### Scenario: Agent triggers an event remotely
- **WHEN** the LLM calls `trigger_event(eventId)`
- **THEN** the MCP server dispatches `{ "type": "FIRE_EVENT", "eventId": "<eventId>" }` over the socket.

#### Scenario: Agent overrides an RTPC value
- **WHEN** the LLM calls `set_rtpc_value(param, value)`
- **THEN** the MCP server dispatches `{ "type": "SET_RTPC", "param": "<param>", "value": <value>, "isOverride": true }` over the socket.
