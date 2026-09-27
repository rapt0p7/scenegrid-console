---
type: inspector subsystem
title: Inspector UI and hooks
description: Tweakpane control panels, profiler widgets, telemetry hooks, visualizer helpers, and the meter worklet used by the inspector package.
tags: [inspector, ui, hooks, worklet]
verified:
  - by: openwiki/0.5.1
    at: 2026-09-27T16:32:49.021Z
sources:
  - id: openwiki-source-6f2f07a38d4c4a6926b35ac8
    resource: repo://packages/inspector/src/AudioDebugPanel.ts
  - id: openwiki-source-fc6c0b5e3ddbca159052e109
    resource: repo://packages/inspector/src/worklets/meter.processor.ts
---

# Inspector UI and hooks

This page covers the rest of the inspector package beyond the top-level debugger entry.

## Owned modules

- `AudioDebugPanel`
- `AudioProfiler`
- `visualizers.ts`
- hooks: `useCommandTransmitter`, `useSnapshotTimeline`, `useTelemetryBus`
- UI widgets such as `VoiceMeterWidget` and `VoiceListWidget`
- `worklets/meter.processor.ts`

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

- `packages/inspector/src/__tests__/visualizers.test.ts`
- `packages/inspector/src/worklets/__tests__/meter.processor.test.ts`
- `packages/inspector/src/__tests__/AudioDebugger.test.ts` for the live DOM integration path

## Scope boundary

This page owns UI composition and telemetry plumbing. The runtime attachment sequence is documented on the debugger runtime page.
