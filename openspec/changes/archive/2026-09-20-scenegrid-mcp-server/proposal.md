## Why

The SceneGrid Engine consumes complex JSON configurations (Buses, Banks, Sounds, Events) and generates rich telemetry data (Playbacks, RTPCs, RAM usage, Cause Chains). AI coding assistants (like Claude or Cursor) currently have no structural way to safely scaffold these configurations or inspect the live runtime state of the engine. An MCP (Model Context Protocol) Server solves this by exposing these domain-specific capabilities as standard tools, effectively turning the LLM into an automated sound designer and QA agent.

## What Changes

- **New Package:** Create `packages/mcp-server` using the `mcp-use` framework.
- **Static Configuration Tools:** Expose a `validate_configurations` tool that uses `@scene-grid/engine`'s `ConsistencyChecker` to statically validate the workspace JSON without requiring a browser environment (identical to how `packages/cli/src/pipeline.ts` operates).
- **Runtime Debugging Tools:** Start a WebSocket server within the MCP process. Rely on the engine's existing `TelemetryWorker` (which inherently bridges telemetry if `remoteSyncUri` is provided) to connect to this server.
- **Tool Expositions:** Expose runtime tools (`get_engine_snapshot`, `trigger_event`, `set_rtpc_value`, `get_cause_chain`, `get_ram_report`) that interact with the in-memory state kept perfectly in sync by the `TelemetryWorker` WebSocket connection.

## Capabilities

### New Capabilities
- `mcp/engine-server`: Provides LLM tools for statically validating JSON configurations, and bridging runtime telemetry via WebSocket for real-time debugging and command execution.

### Modified Capabilities
- *(None. The existing `telemetry/live-bridge` capability in the engine already fully supports this via `remoteSyncUri` without modification.)*

## Impact

- **Infrastructure:** Adds a new `packages/mcp-server` workspace package.
- **Domain:** Absolute isolation maintained. Zero changes to the Domain layer. The dependency rule remains unbroken, as the MCP server strictly interacts with the `Infrastructure/telemetry` adapters or static JSON files.
- **Tooling:** LLM agents gain real-time insight into the running engine state and the ability to author perfectly validated audio configurations.
