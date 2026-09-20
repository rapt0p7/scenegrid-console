## Context

See `proposal.md` for the motivation. The engine is isolated and runs in a browser context, but the MCP server must run in Node.js. The engine already possesses a `TelemetryWorker` that bridges internal telemetry to a remote WebSocket if configured. We will leverage this existing capability rather than creating new engine-side adapters.

## Goals / Non-Goals

**Goals:**
- Provide static validation via the engine's `ConsistencyChecker`.
- Expose runtime tools (snapshot, trigger event, set rtpc) that operate over a WebSocket bridge without modifying the core engine.

**Non-Goals:**
- We will not modify the `@scene-grid/engine` Domain layer.
- We will not implement a standalone GUI for the MCP server.

## Decisions

### 1. WebSocket Backend in the MCP Server
**Decision**: The `packages/mcp-server` package will instantiate a WebSocket server (using the `ws` package) alongside the MCP server. 
**Rationale**: The engine's `TelemetryWorker.ts` is explicitly built to connect to a remote URI (`remoteSyncUri`) and bridge telemetry batches out and commands in. 
**Alternative Considered**: Writing custom REST endpoints or a custom adapter in the engine. Rejected because it breaks the zero-modification goal and reinvents what the `TelemetryWorker` already does.

### 2. InspectorCommand JSON Dispatch
**Decision**: When LLMs invoke tools like `trigger_event(eventId)`, the MCP server will translate this into an exact `InspectorCommand` JSON payload.
- `trigger_event(id)` → `{ "type": "FIRE_EVENT", "eventId": id }`
- `set_rtpc_value(id, val)` → `{ "type": "SET_RTPC", "param": id, "value": val, "isOverride": true }`
**Rationale**: The `CommandReceiver` in the engine already expects this exact format. Sending these via `ws.send()` ensures the `TelemetryWorker` correctly routes them into the engine.

### 3. Static Validation Strategy
**Decision**: Use the same static validation approach as the CLI (`packages/cli/src/pipeline.ts`). The Node.js MCP process will `await import('@scene-grid/engine')`, parse the workspace JSONs into a payload, and run `ConsistencyChecker.validate(payload)`.
**Rationale**: Avoids the overhead of spinning up a headless browser (Puppeteer/Playwright) just to validate JSON files.

## Risks / Trade-offs

- **Risk**: WebSocket connection drops or engine restarts.
  **Mitigation**: The MCP server's tools should defensively check if the WebSocket client is connected before attempting to execute runtime commands (returning a clean "Engine is not connected" error to the LLM). The `TelemetryWorker` already implements exponential backoff reconnection.
