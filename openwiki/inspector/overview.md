---
type: package overview
title: Inspector package overview
description: Canonical map of the `@scene-grid/inspector` and `@scene-grid/debugger` packages, browser-debugger entrypoints, and the UI, hook, and worklet subsystems that power the live overlay.
tags: [inspector, package, debugger]
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

# Inspector package overview

`@scene-grid/inspector` and `@scene-grid/debugger` serve as the browser-side debug and observability companions for the engine. They read engine state and render live mixer, telemetry, and control UIs.

## Public export surface

The `@scene-grid/debugger` package barrel exports:

- `AudioDebugger`
- `initAudioDebugPanel`
- `attachDebugUI`

## Runtime shape

- `AudioDebugger` builds the bus/meter/spectrum view from engine debug objects.
- `AudioDebugPanel` builds the tweakpane-driven control surface.
- `AudioProfiler` computes the values shown in the panel.
- hooks and worklets provide live telemetry and visual meters.

## Relationship to other pages

- See [Inspector debugger runtime](./debugger.md) for the DOM and panel entry flow.
- See [Inspector UI and hooks](./ui-and-hooks.md) for the visualizer and control subsystems.

## Representative tests

- `packages/debugger/src/__tests__/AudioDebugger.test.ts`
- `packages/debugger/src/__tests__/visualizers.test.ts`
- `packages/debugger/src/worklets/__tests__/meter.processor.test.ts`

## Scope boundary

This page maps the package boundary only. Detailed behavior for the debugger entry and UI subsystems belongs in the linked pages.
