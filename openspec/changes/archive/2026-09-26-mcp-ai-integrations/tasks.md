## 1. Trace and Session Buffering (WebSocketTelemetryServer)

- [x] 1.1 **RED**: Write a failing unit test in `WebSocketTelemetryServer.test.ts` asserting that a ring-buffer evicts older `CAUSE_CHAIN` and `LIFECYCLE` events.
- [x] 1.2 **GREEN**: Implement `traceHistory` buffer in `WebSocketTelemetryServer` to make the test pass.
- [x] 1.3 **RED**: Write a failing unit test asserting that `sessionBuffer` only captures events between `startRecording` and `stopRecording`.
- [x] 1.4 **GREEN**: Implement `isRecordingSession`, `sessionBuffer`, `startRecording()`, and `stopRecording()` in `WebSocketTelemetryServer` to make the test pass.
- [x] 1.5 **REFACTOR**: Review `WebSocketTelemetryServer` code for clarity and maintainability, ensuring zero-allocation or minimal allocations for buffering logic.

## 2. MCP Tools Implementation (runtime_tools.ts)

- [x] 2.1 **RED**: Write failing tests in `runtime_tools.test.ts` for `query_graph`, `trace_event`, and `record_session_telemetry` handlers.
- [x] 2.2 **GREEN**: Implement `query_graph` to successfully traverse the cached manifest.
- [x] 2.3 **GREEN**: Implement `trace_event` to retrieve data from `WebSocketTelemetryServer`'s trace buffer.
- [x] 2.4 **GREEN**: Implement `record_session_telemetry` to toggle recording state and fetch the buffer.
- [x] 2.5 **REFACTOR**: Extract any repeated JSON traversal logic or schema validation in `runtime_tools.ts`.

## 3. MCP Resources and Schema Disclosure (index.ts)

- [x] 3.1 **RED**: Write failing tests simulating an MCP client fetching the `scenegrid://context/conventions` and calling the `get_schema` tool (with and without slice targeting).
- [x] 3.2 **GREEN**: Implement the `scenegrid://context/conventions` resource handler in `index.ts` using `node:fs` to read `AGENTS.md`.
- [x] 3.3 **GREEN**: Implement the `get_schema` tool to serve `schema.json` OR `schema.dereferenced.json`. If a specific definition slice is requested, parse the dereferenced schema, extract the target tree, and return the subset.
- [x] 3.4 **REFACTOR**: Ensure proper error handling (e.g., file not found, definition missing in schema) is cleanly implemented without crashing the server. Consider caching the parsed schema.

## 4. CLI Schema Export

- [x] 4.1 **RED**: Write a failing test in `packages/cli/src/__tests__/index.test.ts` verifying that `scenegrid generate-schemas` executes the underlying generator script.
- [x] 4.2 **GREEN**: Add the `generate-schemas` sub-command to `packages/cli/src/index.ts`.
- [x] 4.3 **REFACTOR**: Clean up CLI argument parsing or imports if necessary.

## 5. Verification

- [x] 5.1 Run `npm run typecheck` and `npm run lint` across the monorepo and verify there are no oxc linting warnings or TS errors introduced.
- [x] 5.2 Validate the final integration by running the MCP server locally and manually calling `get_schema` and `scenegrid://context/conventions` to ensure filesystem resolution paths are correct.
