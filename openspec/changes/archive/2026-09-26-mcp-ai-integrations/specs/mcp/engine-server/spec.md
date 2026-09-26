## ADDED Requirements

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
