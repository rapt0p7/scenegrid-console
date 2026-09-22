## Why

The current MCP server exposes monolithic telemetry operations (`get_active_playbacks`, `get_engine_manifest`, etc.) as tools. The MCP specification recommends distinguishing between Tools (active actions/verbs) and Resources (passive contextual data). Additionally, we lack tools to dynamically control the engine's playback state (stopping all sounds, pausing/resuming) or apply mixer snapshots, which hinders interactive and deep audio debugging sessions via LLMs.

## What Changes

- Transition the existing telemetry fetch operations into MCP **Resources** under the `scenegrid://` URI scheme (e.g., `scenegrid://manifest/current`, `scenegrid://telemetry/live`, `scenegrid://validation/latest`, `scenegrid://ram/budget`).
- Introduce new MCP **Tools** for global execution control: `stop_all_sounds`, `pause_engine`, and `resume_engine`.
- Introduce a new MCP **Tool**: `apply_mixer_snapshot(transitionTimeMs)` to trigger VCA snapshots dynamically.
- Add an MCP **Prompt**: `debug-audio-issue` to provide a ready-made workflow instructing the LLM to read the passive resources and perform a causal analysis of audio culling or ducking.

## Capabilities

### New Capabilities
*(None)*

### Modified Capabilities
- `mcp/engine-server`: Refactors telemetry retrieval from active tools to passive resources, adds global execution control tools, and introduces a debugging prompt.

## Impact

- **Affected Code**: `packages/mcp-server/index.ts` and its tool handlers.
- **Architectural Layer**: Inspector / Infrastructure layer. The MCP server acts purely as a remote client.
- **Dependency Rule**: Unbroken. The Domain layer remains completely untouched and isolated. The server interacts strictly with the `TelemetryWorker` bridge via `CommandDispatcher`.
