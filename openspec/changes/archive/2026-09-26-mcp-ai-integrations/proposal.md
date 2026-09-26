## Why

As AI agents and LLM copilots become more integrated into the SceneGrid development workflow, they need precise, real-time context to correctly write configurations, diagnose live audio faults, and interact with the engine. While the current MCP server provides basic telemetry replication and validation, it lacks capabilities for targeted querying, deep historical tracing, automated context bootstrapping, and precise payload discovery. Adding these advanced MCP features (graph queries, trace events, dynamic schema exposure, etc.) will significantly reduce agent hallucinations, allowing LLMs to operate autonomously on the SceneGrid engine without requiring manual copy-pasting of logs or type definitions.

## What Changes

- Add a `query_graph` tool to the MCP server to traverse and fetch localized manifest branches from the replicated in-memory JSON state.
- Add a `trace_event` tool backed by a rolling ring-buffer in the MCP WebSocket server to capture and query historical `CAUSE_CHAIN` and `LIFECYCLE` events.
- Add a `scenegrid://context/conventions` MCP Resource that dynamically reads the project's `AGENTS.md` to bootstrap agent context.
- Add a `record_session_telemetry` tool that acts as a state machine to start/stop buffering telemetry and dump it for analysis.
- Expose both the referenced (`schema.json`) and dereferenced (`schema.dereferenced.json`) JSON Schemas via a `get_schema` tool. To handle the massive 22,000+ line dereferenced schema, the tool will support fetching targeted slices (by definition name or path) to conserve agent context.
- Introduce a new `generate-schemas` sub-command in `@scene-grid/cli` to automatically export Domain TypeScript interfaces to JSON Schema for IDE integrations (e.g., Cursor/Copilot).

## Capabilities

### New Capabilities
- `cli/schema-export`: CLI command for exporting the internal Domain TypeScript interfaces to standard JSON Schema.

### Modified Capabilities
- `mcp/engine-server`: Expanding the MCP server requirements to support localized graph queries, historical trace buffering, session recording, context bootstrapping, and dynamic schema disclosure.

## Impact

- **@scene-grid/mcp-server**: Expanding `runtime_tools.ts` to add the new tools and `index.ts` for new resources. Modifying `WebSocketTelemetryServer.ts` to implement local ring-buffers for traces and session recording.
- **@scene-grid/cli**: Adding the `generate-schemas` command to `index.ts`.
- **Zero-Allocation Engine**: **Unaffected**. All changes operate safely behind the WebSocket boundary or at build-time (CLI), ensuring the strict zero-allocation constraints inside the live engine are preserved. No changes required to `@scene-grid/engine`'s core loop or `CommandReceiver`.
