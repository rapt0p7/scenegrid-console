## Why

The `packages/inspector` package currently imports types directly from `@scene-grid/engine` (e.g. `AudioCtx`, `GainNodeLike`, `ISoundInstance`). This violates our architectural boundaries, as the Inspector should be an independent observer and not tightly coupled to the Engine's internal types. This tight coupling means changes to engine types can break the inspector, and it introduces a dependency on the engine layer.

## What Changes

- Create local structural types inside `packages/inspector/src/types/` (e.g., `IAudioCtxProxy`, `IGainNodeProxy`, `ISoundInstanceProxy`) that define the minimal interface required by the inspector.
- Refactor inspector files (`AudioDebugger.ts`, `AudioProfiler.ts`, `visualizers.ts`) to use these local proxies instead of importing from the engine.
- Remove `@scene-grid/engine` from `packages/inspector/package.json` dependencies.

## Capabilities

### New Capabilities
None

### Modified Capabilities
None

## Impact

- **Affected code:** `packages/inspector` (`AudioDebugger.ts`, `AudioProfiler.ts`, `visualizers.ts`, `package.json`).
- **Architecture:** Restores strict architectural isolation. The dependency rule is unbroken. The Inspector layer no longer depends on the Engine layer, making it truly decoupled.
