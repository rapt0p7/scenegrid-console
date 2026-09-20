## 1. Project Initialization

- [x] 1.1 Login to the `mcp-use` CLI by running `npx -y mcp-use@latest login`.
- [x] 1.2 Install the `mcp-use` skill by running `npx --yes skills add mcp-use/mcp-use#main --yes --skill mcp-apps-builder -a cursor -a claude-code -a codex`.
- [x] 1.3 Scaffold the `packages/mcp-server` workspace using `npx -y create-mcp-use-app@latest packages/mcp-server --template mcp-apps`. Verify it builds.
- [x] 1.4 For tsconfig and vite config refences use `packages/cli`.
- [x] 1.5 Install the `ws` and testing dependencies (e.g., `vitest`) within the new workspace. Verify `npm run test` executes successfully.

## 2. WebSocket Backend (TDD)

- [x] 2.1 (RED) Write a failing unit test for `WebSocketTelemetryServer` asserting it opens a port and correctly parses incoming telemetry JSON into memory. Verify the test fails.
- [x] 2.2 (GREEN) Implement the `WebSocketTelemetryServer` to satisfy the parsing and connection test. Verify the test passes.
- [x] 2.3 (REFACTOR) Extract connection lifecycle management into its own method and strictly type the payloads. Verify tests still pass.
- [x] 2.4 (RED) Write a failing test for the command dispatcher asserting it formats exact `FIRE_EVENT`, `SET_RTPC`, and `GLOBAL_ACTION` JSON payloads for clients. Verify the test fails.
- [x] 2.5 (GREEN) Implement the command dispatcher. Verify the formatting tests pass.

## 3. Static Configuration Tools (TDD)

- [x] 3.1 (RED) Write a failing test for `validate_configurations` that passes invalid JSON and expects specific `ConsistencyChecker` errors. Verify the test fails.
- [x] 3.2 (GREEN) Implement `validate_configurations` using the `@scene-grid/engine` import. Verify it correctly identifies the invalid JSON from the test.
- [x] 3.3 (REFACTOR) Extract common file-system I/O (reading/writing JSON) into shared utility functions if needed. Verify all configuration tests still pass.

## 4. Runtime Debugging Tools (TDD)

- [x] 4.1 (RED) Write a failing unit test for `get_telemetry_snapshot` MCP tool asserting it correctly retrieves the in-memory WebSocket state. Verify the test fails.
- [x] 4.2 (GREEN) Implement the `get_telemetry_snapshot`, `get_cause_chain`, and `get_ram_report` MCP tools. Verify the retrieval tests pass.
- [x] 4.3 (RED) Write a failing test for `trigger_event` asserting it correctly delegates its arguments to the command dispatcher. Verify the test fails.
- [x] 4.4 (GREEN) Implement the `trigger_event` and `set_rtpc_value` MCP tools. Verify the delegation tests pass.

## 5. Server Wiring and MCP Tool Registration

- [x] 5.1 (GREEN) In `index.ts`, instantiate the `WebSocketTelemetryServer` and start it on the designated port so it's ready to receive connections.
- [x] 5.2 (GREEN) Register the runtime tools (`get_telemetry_snapshot`, `get_cause_chain`, `get_ram_report`, `trigger_event`, `set_rtpc_value`) as MCP tools using `server.tool(...)` with precise `zod` input and output schemas.
- [x] 5.3 (GREEN) Register the static configuration tool (`validate_configurations`) as an MCP tool using `server.tool(...)` with `zod` schemas.

## 6. Integration

- [x] 6.1 (GREEN) Add an example script that boots the `scenegrid-console` with `remoteSyncUri` set to the MCP server's WebSocket address, and verify end-to-end telemetry flow manually.

## 7. Documentation

- [x] 7.1 Create `packages/mcp-server/README.md`. Document every available MCP tool, providing clear instructions on when and how AI agents should use them for scaffolding and debugging. Verify the markdown is clear and well-formatted.

## 8. Deployment

- [x] 8.1 Deploy the MCP app using `npx -y mcp-use@latest deploy` (use `--no-github -y` for Manufact-managed repo, or standard deploy if using own GitHub org).
- [x] 8.2 Save the provided MCP URL (to connect clients) and the Manufact Cloud dashboard URL (for analytics and logs).
