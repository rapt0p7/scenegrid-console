# mcp/engine-server Specification

## Purpose
Provides an MCP server that enables AI assistants to scaffold valid SceneGrid configurations and inspect live engine state via a WebSocket telemetry bridge.

## Requirements

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

### Requirement: AOT Asset Processing Tool
The MCP Server SHALL provide a tool to execute the CLI asset processing pipeline programmatically.

#### Scenario: Agent requests full asset processing
- **WHEN** the agent calls `process_assets` with valid pipeline options (inputDir, outputDir, manifestsDir, quotaMb, streamRules, streamExclusions)
- **THEN** the MCP server executes the `@scene-grid/cli` pipeline and generates the audio assets and manifests

### Requirement: SoundId Alias Generation Tool
The MCP Server SHALL provide a tool to scan directories and generate SoundId aliases.

#### Scenario: Agent requests alias generation
- **WHEN** the agent calls `generate_aliases` with an input directory and output file
- **THEN** the MCP server executes the `@scene-grid/cli` alias generator to map file names to typed SoundIds

### Requirement: PCM Memory Weight Inspection Tool
The MCP Server SHALL provide a tool to inspect the uncompressed memory footprint of raw audio files.

#### Scenario: Agent inspects a raw audio file
- **WHEN** the agent calls `inspect_pcm_weight` for a specific file path
- **THEN** the MCP server reads the file header and returns the duration, channels, sample rate, and exact PCM size in bytes

### Requirement: Quota Preview Tool
The MCP Server SHALL provide a tool to generate a dry-run memory allocation preview.

#### Scenario: Agent requests quota preview
- **WHEN** the agent calls the `get_quota_preview` tool with an input directory, RAM quota, and streaming rules
- **THEN** the server returns a dry-run report detailing which assets will be loaded into memory and which will be streamed, based on the provided inputs

### Requirement: Selective Graph Queries
The MCP Server SHALL provide a `query_graph` tool that allows agents to fetch localized manifest branches from the replicated in-memory JSON state without querying the live engine process.

#### Scenario: Agent queries a specific bus
- **WHEN** the agent calls `query_graph` with a query for a specific `BusId`
- **THEN** the server returns only the JSON sub-tree corresponding to that bus from its local cache

### Requirement: Cause Chain Diagnostics
The MCP Server SHALL maintain a rolling ring-buffer in memory to capture incoming `CAUSE_CHAIN` and `LIFECYCLE` events from the WebSocket stream, and SHALL provide a `trace_event` tool to query this history.

#### Scenario: Agent traces causal events
- **WHEN** the agent calls `trace_event`
- **THEN** the server returns the recent history of causal events from its ring-buffer

### Requirement: Self-Bootstrapping Context
The MCP Server SHALL provide a `scenegrid://context/conventions` Resource that dynamically reads the project's agent conventions from disk to bootstrap agent context.

#### Scenario: Agent reads context
- **WHEN** the agent requests the `scenegrid://context/conventions` resource
- **THEN** the server reads and returns the contents of the local `AGENTS.md` (or `.agents` conventions) file

### Requirement: Interactive Session Record
The MCP Server SHALL provide a `record_session_telemetry` tool that acts as a state machine to start and stop the buffering of all incoming telemetry, returning the full dump when stopped.

#### Scenario: Agent records telemetry
- **WHEN** the agent calls `record_session_telemetry` with state `start`
- **THEN** the server begins buffering all incoming telemetry snapshots
- **WHEN** the agent calls `record_session_telemetry` with state `stop`
- **THEN** the server stops buffering and returns the accumulated telemetry dump

### Requirement: Progressive Schema Disclosure
The MCP Server SHALL expose the pre-generated JSON Schemas via a `get_schema` tool. The tool SHALL allow querying either the referenced (`schema.json`) or dereferenced (`schema.dereferenced.json`) schema. If querying the dereferenced schema, the tool SHALL accept optional targeting parameters (e.g., definition name) to return only a localized slice of the massive schema, preventing context overflow.

#### Scenario: Agent discovers payload schema slice
- **WHEN** the agent invokes `get_schema` requesting the definition for `ISoundConfig` from the dereferenced schema
- **THEN** the server parses `schema.dereferenced.json` and returns only the sub-tree defining `ISoundConfig`
