---
type: quickstart
title: OpenWiki quickstart
description: Entry map for the repository wiki, with the canonical pages for each package, runtime workflow, and the minimal validation path for common change intents.
tags: [openwiki, quickstart, navigation]
verified:
  - by: openwiki/0.5.1
    at: 2026-09-27T16:32:49.021Z
sources:
  - id: openwiki-source-85a2f85f45f76d7dd1978389
    resource: repo://examples/package.json
  - id: openwiki-source-a038f25a99dd9c7512d4a006
    resource: repo://packages/engine/package.json
  - id: openwiki-source-a1c5d4117cfa37afc36cb8c7
    resource: repo://packages/inspector/package.json
  - id: openwiki-source-c83ceec2d47257f066951051
    resource: repo://packages/shared/package.json
---

# OpenWiki quickstart

This wiki explains the repository as a set of runtime packages and workflows:

- `@scene-grid/engine` owns the audio runtime.
- `@scene-grid/inspector` owns the browser debugger.
- `@scene-grid/shared` owns the reusable contracts, math, and worker bridge.
- `examples` shows how the packages are consumed together in a browser app.

## Start here

- [Repository architecture overview](./architecture/overview.md)
- [Engine package overview](./engine/overview.md)
- [Inspector package overview](./inspector/overview.md)
- [Shared package contract](./shared/index.md)
- [Example app runtime](./examples/runtime.md)

## How to navigate the wiki

- Open the package overview for the boundary you want to change.
- Follow the linked subsystem page for the runtime or domain owned by that boundary.
- Use the representative tests listed on each page to find the narrowest validation suite.
- Prefer the minimal command that exercises the behavior you changed before running a broader workspace check.

## Task-routing table

| Change intent | Canonical wiki page | Source entrypoint / symbols | Focused tests | Minimal validation |
| --- | --- | --- | --- | --- |
| Change demo bootstrap, HMR, or dev-only inspector attach | [Example app runtime](./examples/runtime.md) | `examples/main.ts`, `examples/inspector.tsx` | Example runtime tests if added; engine/inspector integration tests | `npm run dev --workspace=examples` |
| Change the engine public API or startup sequence | [Audio engine façade](./engine/application/audio-engine.md) | `packages/engine/src/Application/AudioEngine.ts`, `packages/engine/src/index.ts` | `packages/engine/src/Application/__tests__/AudioEngine.test.ts` | `npm test -- --runInBand packages/engine/src/Application/__tests__/AudioEngine.test.ts` |
| Change startup validation or config gating | [Validation pipeline](./engine/domain/validation.md) | `packages/engine/src/Domain/Validation/ConsistencyChecker.ts` | `packages/engine/src/Domain/Validation/__tests__/ConsistencyChecker.test.ts` | `npm test -- --runInBand packages/engine/src/Domain/Validation/__tests__/ConsistencyChecker.test.ts` |
| Change mix snapshots or transition timing | [Mixer state and transitions](./engine/domain/mixer.md) | `packages/engine/src/Domain/Mixer/MixerTransitionEngine.ts` | `packages/engine/src/Domain/Mixer/__tests__/MixerTransitionEngine.test.ts` | `npm test -- --runInBand packages/engine/src/Domain/Mixer/__tests__/MixerTransitionEngine.test.ts` |
| Change music looping, stingers, or quantization | [Orchestration and music control](./engine/domain/orchestration.md) | `packages/engine/src/Domain/Orchestration/Sequencer.ts`, `MusicFsmEvaluator.ts`, `SmartLoopTransitionPolicy.ts` | `packages/engine/src/Domain/Orchestration/__tests__/Sequencer.test.ts` | `npm test -- --runInBand packages/engine/src/Domain/Orchestration/__tests__/Sequencer.test.ts` |
| Change routing, playback policies, or RTPC binding | [Routing and playback managers](./engine/domain/router-and-managers.md) | `packages/engine/src/Domain/Router/AudioRouter.ts`, `ContainerPlaybackPolicy.ts`, `SwitchPlaybackPolicy.ts` | `packages/engine/src/Domain/Router/__tests__/AudioRouter.test.ts` | `npm test -- --runInBand packages/engine/src/Domain/Router/__tests__/AudioRouter.test.ts` |
| Change Web Audio adapter plumbing, buses, or limiter behavior | [Engine infrastructure overview](./engine/infrastructure/overview.md) | `packages/engine/src/Infrastructure/**` | Subsystem tests linked from the infrastructure pages | Targeted subsystem test file |
| Change shared math, memory, or worker contracts | [Shared package contract](./shared/index.md) | `packages/shared/src/index.ts`, `createTelemetryWorker`, `evaluateRTPCCurve`, `ConcurrencyThrottler` | `packages/shared/src/Math/__tests__/rtpcMath.test.ts`, `packages/shared/src/Memory/__tests__/ConcurrencyThrottler.test.ts` | `npm test -- --runInBand packages/shared/src/Math/__tests__/rtpcMath.test.ts` |
| Change the inspector runtime overlay or panel | [Inspector debugger runtime](./inspector/debugger.md) | `packages/inspector/src/AudioDebugger.ts`, `attachDebugUI` | `packages/inspector/src/__tests__/AudioDebugger.test.ts` | `npm test -- --runInBand packages/inspector/src/__tests__/AudioDebugger.test.ts` |
| Change inspector controls, hooks, or meters | [Inspector UI and hooks](./inspector/ui-and-hooks.md) | `AudioDebugPanel.ts`, `AudioProfiler.ts`, `visualizers.ts`, hooks | `packages/inspector/src/__tests__/visualizers.test.ts`, `packages/inspector/src/worklets/__tests__/meter.processor.test.ts` | `npm test -- --runInBand packages/inspector/src/__tests__/visualizers.test.ts` |

## Main concepts

- [Package boundaries and runtime flow](./architecture/overview.md)
- [Engine startup and runtime façade](./engine/application/audio-engine.md)
- [Engine validation pipeline](./engine/domain/validation.md)
- [Engine mix and music control](./engine/domain/mixer.md), [Orchestration and music control](./engine/domain/orchestration.md)
- [Engine routing and playback policies](./engine/domain/router-and-managers.md)
- [Inspector debugger runtime](./inspector/debugger.md)
- [Inspector UI and hooks](./inspector/ui-and-hooks.md)
- [Shared contract and worker bridge](./shared/index.md)
- [Example app runtime](./examples/runtime.md)

## Backlog

- The wiki does not document every auxiliary script or generated artifact. Start from the pages above and the repository root scripts when you need a broad build or release workflow.
- If you need changelog or release automation details, use the root `package.json` scripts and the repository changelog files as the source anchor.
