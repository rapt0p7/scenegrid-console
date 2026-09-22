## 1. Command Dispatcher Enhancements

- [x] 1.1 (RED) Write a failing unit test in `packages/mcp-server/src/__tests__/CommandDispatcher.test.ts` for `applySnapshot`, `stopAll`, `pauseAll`, and `resumeAll` to verify the correct `InspectorCommand` payloads are broadcast.
- [x] 1.2 (GREEN) Implement `applySnapshot`, `stopAll`, `pauseAll`, and `resumeAll` in `packages/mcp-server/src/CommandDispatcher.ts` and verify the tests pass.

## 2. MCP Passive Resources

- [x] 2.1 (RED) Write failing tests to verify the resource handlers for `scenegrid://manifest/current`, `scenegrid://telemetry/live`, `scenegrid://validation/latest`, and `scenegrid://ram/budget` correctly return the server's telemetry state.
- [x] 2.2 (GREEN) In `packages/mcp-server/index.ts`, remove the monolithic active tools (`get_active_playbacks`, `get_bus_state`, `get_rtpc_values`, `get_consistency_report`, `get_ram_report`, `get_engine_manifest`) and replace them with `server.resource()` bindings. Verify the tests pass.

## 3. MCP Active Tools

- [x] 3.1 (RED) Write failing tests for tool handlers of `stop_all_sounds`, `pause_engine`, `resume_engine`, and `apply_mixer_snapshot(snapshotId, transitionTimeMs)`.
- [x] 3.2 (GREEN) Register the new active tools in `packages/mcp-server/index.ts`, bind them to the updated `CommandDispatcher`, and verify the tests pass.

## 4. MCP Debugging Prompts

- [x] 4.1 (RED) Write a failing test for the `debug-audio-issue` prompt handler, ensuring it returns the expected system message guiding the LLM on which resources to fetch.
- [x] 4.2 (GREEN) Register the `debug-audio-issue` prompt in `packages/mcp-server/index.ts` using `server.prompt()` and verify the test passes.

## 5. Quality Check and Verification

- [x] 5.1 Run `npm run lint -w packages/mcp-server` and `npm run test -w packages/mcp-server` to verify no lint warnings exist and all tests pass.
- [x] 5.2 Self-check code health of the modified `packages/mcp-server/index.ts` and `CommandDispatcher.ts` files to verify maintainability.
