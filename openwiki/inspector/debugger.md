---
type: runtime entrypoint
title: Inspector debugger runtime
description: The `AudioDebugger` and `attachDebugUI` entrypoints that attach live bus visualizations to an initialized engine instance.
tags: [inspector, runtime, debugger]
sources:
  - id: openwiki-source-0832095ccce44564be245c56
    resource: repo://packages/debugger/src/AudioDebugger.ts
  - id: openwiki-source-e2c68503f698be46f934529d
    resource: repo://packages/debugger/src/index.ts
verified:
  - by: openwiki/0.5.1
    at: 2026-10-14T20:11:32.061Z
generated: { by: "antigravity", at: "2026-10-14T20:11:32.061Z" }
---

# Inspector debugger runtime

This page documents the runtime entry that turns engine debug state into a visible panel.

## Entrypoints

- `AudioDebugger` in `packages/debugger/src/AudioDebugger.ts`
- `attachDebugUI` in `packages/debugger/src/index.ts`
- `initAudioDebugPanel` in `packages/debugger/src/AudioDebugPanel.ts`

## Responsibilities

- validate that the engine exposes the expected debug surface;
- attach live bus, master, and visualizer columns to the DOM;
- delegate deeper control-surface construction to the debug panel;
- keep failure behavior soft when the wrapper element or engine debug object is missing.

```mermaid
sequenceDiagram
    participant App as example app
    participant Inspector as attachDebugUI
    participant Debugger as AudioDebugger
    participant DOM as document wrapper
    participant Visualizers as visualizer helpers

    App->>Inspector: attachDebugUI(audioEngine, options)
    Inspector->>Debugger: init(context, busSystem, masterNode)
    Debugger->>DOM: build columns and containers
    Debugger->>Visualizers: createFrequencyCurveWithRMS / createMeters
```

## Important invariants

- a missing wrapper element should warn and return instead of throwing;
- the master bus is always included first in the analysis view;
- each active bus with an analyzer tap gets its own column and meter/curve widgets;
- the runtime should stay mockable in tests by accepting a worklet-loader contract.

## Representative tests

- `packages/debugger/src/__tests__/AudioDebugger.test.ts`

## Scope boundary

The control panel, profiler, and meter/graph helpers are documented on the UI-and-hooks page.
