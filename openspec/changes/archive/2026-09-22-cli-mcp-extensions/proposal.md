## Why

The current `@scene-grid/mcp-server` only interacts with live runtime debugging and static configuration checks. Extending the MCP server with Ahead-Of-Time (AOT) processing tools and memory management utilities will allow AI agents to fully onboard new audio assets, calculate memory footprints without running the engine, and execute the CLI build pipeline programmatically.

## What Changes

- Add `@scene-grid/cli` as a dependency in `packages/mcp-server/package.json` to enable clean cross-package programmatic imports.
- Expose the CLI pipeline tools (`process_assets`, `generate_aliases`) as MCP Tools.
- Expose CLI PCM calculation logic (`inspect_pcm_weight`) as an MCP Tool.
- Expose a passive `scenegrid://assets/quota-preview` MCP Resource to provide dry-run memory allocation reports.
- No changes to any packages outside `packages/mcp-server`. The existing exports from `packages/cli` will be imported natively.

## Capabilities

### New Capabilities

### Modified Capabilities
- `mcp/engine-server`: We are adding new AOT processing and memory management tools, and a passive quota-preview resource.

## Impact

- **Affected Layers:** `packages/mcp-server` (Application boundary).
- **Dependency Rule:** The dependency inward to Domain remains unbroken. `mcp-server` acts as a consumer of the `cli` library for asset processing.
- **Dependencies:** `@scene-grid/cli` will be explicitly added to `@scene-grid/mcp-server` dependencies to formally support imports.
