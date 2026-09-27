---
type: package overview
title: Inspector package overview
description: Canonical map of the `@scene-grid/inspector` package, its browser-debugger entrypoints, and the UI, hook, and worklet subsystems that power the live overlay.
tags: [inspector, package, debugger]
verified:
  - by: openwiki/0.5.1
    at: 2026-09-27T16:32:49.021Z
sources:
  - id: openwiki-source-1d5210582c2e4047cd94c6c3
    resource: repo://packages/inspector/src/AudioDebugger.ts
  - id: openwiki-source-fbd7fb9bd8ae10b828f46f70
    resource: repo://packages/inspector/src/index.ts
---

# Inspector package overview

`@scene-grid/inspector` is the browser-side debug companion for the engine. It reads engine state and renders the live mixer and telemetry UI.

## Public export surface

The package barrel exports:

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

- `packages/inspector/src/__tests__/AudioDebugger.test.ts`
- `packages/inspector/src/__tests__/visualizers.test.ts`
- `packages/inspector/src/worklets/__tests__/meter.processor.test.ts`

## Scope boundary

This page maps the package boundary only. Detailed behavior for the debugger entry and UI subsystems belongs in the linked pages.
