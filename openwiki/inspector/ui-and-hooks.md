---
type: inspector subsystem
title: Inspector UI and hooks
description: Tweakpane control panels, profiler widgets, telemetry hooks, visualizer helpers, and the meter worklet used by the inspector and debugger packages.
tags: [inspector, ui, hooks, worklet]
sources:
  - id: openwiki-source-350abc7ea9e73c4d11087d9e
    resource: repo://packages/debugger/src/AudioDebugPanel.ts
  - id: openwiki-source-29f3a7d8494894a66cad5c49
    resource: repo://packages/debugger/src/worklets/meter.processor.ts
verified:
  - by: openwiki/0.5.1
    at: 2026-10-14T20:11:32.061Z
generated: { by: "antigravity", at: "2026-10-14T20:11:32.061Z" }
---

# Inspector UI and hooks

This page covers the debugger and inspector UI components, widgets, and reactive telemetry hooks.

## Owned modules

- `AudioDebugPanel` in `packages/debugger/src/AudioDebugPanel.ts`
- `AudioProfiler` in `packages/debugger/src/AudioProfiler.ts`
- `visualizers.ts` in `packages/debugger/src/visualizers.ts`
- hooks: `useCommandTransmitter`, `useSnapshotTimeline`, `useTelemetryBus` in `packages/inspector/src/hooks/`
- UI widgets such as `VoiceMeterWidget` and `VoiceListWidget` in `packages/debugger/src/ui/`
- `worklets/meter.processor.ts` in `packages/debugger/src/worklets/`

## Responsibilities

- provide the tweakpane control surface for runtime experimentation;
- compute live telemetry and bus metrics for the panel;
- render graphs, meters, and timeline information;
- move commands and telemetry between the browser UI and engine transport layer;
- keep the meter worklet isolated so it can be tested independently.

## Important invariants

- the panel must tolerate a missing engine instance by warning instead of crashing;
- visualizer helpers must degrade safely when browser capabilities are not present;
- the hooks should preserve transport contracts rather than inventing new command shapes;
- the worklet should remain deterministic and testable as a processor.

## Representative tests

- `packages/debugger/src/__tests__/visualizers.test.ts`
- `packages/debugger/src/worklets/__tests__/meter.processor.test.ts`
- `packages/debugger/src/__tests__/AudioDebugger.test.ts` for the live DOM integration path

## Scope boundary

This page owns UI composition and telemetry plumbing. The runtime attachment sequence is documented on the debugger runtime page.
