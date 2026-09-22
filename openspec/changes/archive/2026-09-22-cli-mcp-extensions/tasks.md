## 1. Dependency Updates

- [x] 1.1 Add `@scene-grid/cli` to `dependencies` in `packages/mcp-server/package.json` and verify `npm install` runs successfully.

## 2. AOT Asset Processing Tool

- [x] 2.1 (RED) Write a failing unit test in `packages/mcp-server/src/__tests__/runtime_tools.test.ts` for the `process_assets` MCP tool handler.
- [x] 2.2 (GREEN) Implement the `process_assets` tool by importing `processAssets` from `@scene-grid/cli` (or `@scene-grid/cli/src/pipeline.js`) and register it in `packages/mcp-server/index.ts`. Verify the test passes.

## 3. SoundId Alias Generation Tool

- [x] 3.1 (RED) Write a failing test for the `generate_aliases` tool handler in `runtime_tools.test.ts`.
- [x] 3.2 (GREEN) Implement the `generate_aliases` tool using `prepareAliases` from `@scene-grid/cli` (or `@scene-grid/cli/src/pipeline.js`) and register it. Verify the test passes.

## 4. PCM Memory Weight Inspection Tool

- [x] 4.1 (RED) Write a failing test for the `inspect_pcm_weight` tool handler.
- [x] 4.2 (GREEN) Implement the `inspect_pcm_weight` tool using `extractMetadata` and `calculatePCMSize` from `@scene-grid/cli` (or `@scene-grid/cli/src/pcm.js`) and register it. Verify the test passes.

## 5. Quota Preview Tool

- [x] 5.1 (RED) Write a failing test for the `get_quota_preview` tool handler that validates the dry-run memory allocation calculation logic.
- [x] 5.2 (GREEN) Implement the tool by scanning the input directory, using `calculatePCMSize` and `routeAsset` from `@scene-grid/cli`, and building a JSON report. Register it in `index.ts`. Verify the test passes.

## 6. Final Validation

- [x] 6.1 Run `npm run lint -w packages/mcp-server` and `npm run test -w packages/mcp-server` to verify no lint warnings exist and all tests pass.
- [x] 6.2 Use `get_health` on the modified `packages/mcp-server/index.ts` and `runtime_tools.ts` to ensure maintainability and absence of defects.
- [x] 6.3 Update `packages/mcp-server/README.md` to document the new AOT/CLI MCP Tools and the `get_quota_preview` tool.
