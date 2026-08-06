## 1. Modify Build Tooling

- [x] 1.1 Update `scripts/vite-worklet-isolator.ts` to export the transpiled JavaScript as a raw string instead of generating a `blob:` URL.

## 2. Implement Unified Loader

- [x] 2.1 Write tests for `WorkletLoader` mocking `audioContext.audioWorklet.addModule` failure modes.
- [x] 2.2 Create `packages/engine/src/Infrastructure/worklets/WorkletLoader.ts` with progressive fallback logic (`blob:` -> `data:`).
- [x] 2.3 Verify `WorkletLoader.ts` clears all oxlint warnings.

## 3. Refactor Engine Plugins

- [x] 3.1 Update `SidechainDucker.ts` to use `WorkletLoader` instead of `addModule(processorUrl)`.
- [x] 3.2 Update `FiltersPlugin.ts` to use `WorkletLoader`.
- [x] 3.3 Update `TinyLimiterNode.ts` to use `WorkletLoader`.
- [x] 3.4 Search for any remaining plugins referencing `?worklet` and update them to use `WorkletLoader`.
- [x] 3.5 Run the test suite (`npm run test`) to ensure plugin initialization still succeeds.

## 4. Refactor Inspector with Dependency Injection

- [x] 4.1 Expose `WorkletLoader` in the engine's public API (`packages/engine/src/index.ts`).
- [x] 4.2 Update `packages/inspector/src/visualizers.ts` to accept an injected `WorkletLoader` instead of loading directly.
- [x] 4.3 Update `examples/main.ts` to inject the engine's `WorkletLoader` into the inspector when attaching the debug UI.

## 5. Final Verification

- [x] 5.1 Run the dev environment (`npm run dev`) and manually verify the engine, plugins, and the inspector visualizations load successfully.
- [x] 5.2 Run `npm run lint` and `npm run typecheck` to ensure no regressions.
