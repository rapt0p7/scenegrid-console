## Context

See `proposal.md` for the motivation and capabilities. The SceneGrid engine employs a strict zero-allocation requirement in the browser runtime, utilizing `CyclePool` for telemetry and relying on `MessagePort` (via `TelemetryWorker`) for bidirectional communication with the MCP Node server. The MCP server already receives snapshots via `WebSocketTelemetryServer.ts`. The schema generation is already handled by a provided script in `packages/mcp-server/generated/schema.json`. 

## Goals / Non-Goals

**Goals:**
- Extend the MCP Server to support in-memory historical tracing of telemetry and session recording without modifying the engine.
- Expose CLI and Node-side tools to query the engine's JSON manifest.
- Provide progressive schema disclosure via existing static JSON schema files.

**Non-Goals:**
- We will NOT refactor the Domain layer to use Zod schemas natively.
- We will NOT add patching or hot-reloading to the engine.

## Decisions

### 1. In-Memory Telemetry Ring Buffer
**Decision:** We will add a `telemetryHistory` buffer of the last 1000 `CAUSE_CHAIN` and `LIFECYCLE` events directly within the `WebSocketTelemetryServer`.
**Rationale:** The engine already transmits these packets via the worker. Buffering them in Node.js costs very little memory and completely avoids adding GC pressure to the engine's data-plane `CyclePool`.
**Alternatives Considered:** Exposing a tool that queries the engine's `CyclePool` via RPC. Rejected because it violates the isolation constraints and adds unnecessary async latency.

### 2. Session Recording State Machine
**Decision:** `WebSocketTelemetryServer` will expose `startRecording()` and `stopRecording()` methods. When recording, it will append all incoming `TelemetrySnapshot` packets to an internal array.
**Rationale:** Simplest approach to stateful recording. Node.js has sufficient memory to handle a long telemetry stream for debugging.

### 3. Progressive Schema Slicing
**Decision:** The `get_schema` tool will read from either `schema.json` (referenced) or `schema.dereferenced.json` (dereferenced). If the user requests a specific slice (e.g., `ISoundConfig`), the tool will parse the 22,000+ line dereferenced JSON into memory, extract the specific `definitions["ISoundConfig"]` sub-tree, and return only that object.
**Rationale:** Sending 22,000 lines of JSON in a single MCP tool response will overwhelm the context window. Slicing allows the agent to navigate the schema lazily. Parsing the JSON file on the fly is acceptable for tooling performance, though we may cache the parsed schema in Node.js memory.

### 4. CLI Schema Export Command
**Decision:** We will add a `generate-schemas` command in `packages/cli/src/index.ts` that likely shells out to the existing schema generation script.
**Rationale:** Exposes the functionality to users consistently via the CLI.

## Risks / Trade-offs

- **Risk: Node.js OOM during session recording** → Mitigation: We can cap the maximum session record size (e.g., 50MB) and throw an error or automatically truncate the oldest data if the LLM leaves recording on indefinitely.
- **Risk: Branded Type Degradation** → Mitigation: The schema generator script handles stripping branded TS types to `string` primitives. We assume the existing `schema.json` output is correctly formed.

## Migration Plan

- Deploy the updated `mcp-server` package via `npm`.
- Ensure users rebuild the CLI (`npm run build -w packages/cli`).
