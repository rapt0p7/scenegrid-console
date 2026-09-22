## ADDED Requirements

### Requirement: Passive Telemetry Resources
The MCP Server SHALL expose the current telemetry state via passive `scenegrid://` URIs instead of active tools, providing contextual data that agents can read in the background.

#### Scenario: Agent reads engine manifest
- **WHEN** the agent fetches the `scenegrid://manifest/current` resource
- **THEN** the server returns the latest JSON manifest received from the `TelemetryWorker`

#### Scenario: Agent reads active playbacks
- **WHEN** the agent fetches the `scenegrid://telemetry/live` resource
- **THEN** the server returns the currently active playbacks, buses, and RTPCs in the engine

### Requirement: LLM Debugging Prompt
The MCP Server SHALL expose a ready-made prompt workflow `debug-audio-issue` that instructs the LLM on how to perform causal analysis of audio failures.

#### Scenario: Agent requests audio debugging assistance
- **WHEN** the user invokes the `debug-audio-issue` prompt
- **THEN** the server returns a user message instructing the LLM to fetch telemetry resources and analyze routing, culling, and ducking states

## MODIFIED Requirements

### Requirement: Runtime Debugging Execution
The MCP Server SHALL provide tools that dispatch standard `InspectorCommand` JSON payloads over the WebSocket to the engine.

#### Scenario: Agent triggers an event remotely
- **WHEN** the LLM calls `trigger_event(eventId)`
- **THEN** the MCP server dispatches `{ "type": "FIRE_EVENT", "eventId": "<eventId>" }` over the socket.

#### Scenario: Agent overrides an RTPC value
- **WHEN** the LLM calls `set_rtpc_value(param, value)`
- **THEN** the MCP server dispatches `{ "type": "SET_RTPC", "param": "<param>", "value": <value>, "isOverride": true }` over the socket.

#### Scenario: Agent stops all sounds
- **WHEN** the LLM calls `stop_all_sounds()`
- **THEN** the MCP server dispatches a `GLOBAL_ACTION` command with `action: 'STOP_ALL'`

#### Scenario: Agent pauses or resumes the engine
- **WHEN** the LLM calls `pause_engine()` or `resume_engine()`
- **THEN** the MCP server dispatches a `GLOBAL_ACTION` command with `action: 'PAUSE_ALL'` or `action: 'RESUME_ALL'`

#### Scenario: Agent applies a mixer snapshot
- **WHEN** the LLM calls `apply_mixer_snapshot(snapshotId, transitionTimeMs)`
- **THEN** the MCP server dispatches an `APPLY_SNAPSHOT` command with the given ID and fade time
