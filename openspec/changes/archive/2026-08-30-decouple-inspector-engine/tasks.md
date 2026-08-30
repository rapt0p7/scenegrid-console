## 1. Type Definitions

- [x] 1.1 Create packages/inspector/src/types/engine-proxies.ts and define local minimal structural interfaces (IAudioCtxProxy, IGainNodeProxy, ISoundInstanceProxy, IAudioBusSystemProxy). Verify by compiling with 	sc --noEmit.

## 2. Refactoring Dependencies

- [x] 2.1 Refactor packages/inspector/src/AudioDebugger.ts to use local proxy types instead of @scene-grid/engine imports. Verify by running 	sc --noEmit.
- [x] 2.2 Refactor packages/inspector/src/AudioProfiler.ts to use local proxy types. Verify by running 	sc --noEmit.
- [x] 2.3 Refactor packages/inspector/src/visualizers.ts to use local proxy types (AudioWorkletNodeLike -> IAudioWorkletNodeProxy, GainNodeLike -> IGainNodeProxy). Verify by running 	sc --noEmit.

## 3. Package Decoupling

- [x] 3.1 Remove @scene-grid/engine from packages/inspector/package.json dependencies.
- [x] 3.2 Run
npm install to update lockfiles and verify
npm run typecheck and
npm run lint pass cleanly across the workspace.
