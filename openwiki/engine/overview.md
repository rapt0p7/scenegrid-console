---
type: package overview
title: Engine package overview
description: Canonical map of the `@scene-grid/engine` package, its public API families, and the domain and infrastructure pages that own each workflow.
tags: [engine, package, api]
verified:
  - by: openwiki/0.5.1
    at: 2026-09-27T15:02:32.352Z
sources:
  - id: openwiki-source-5236a07fa61d4cd901388060
    resource: repo://packages/engine/src/Application/AudioEngine.ts
  - id: openwiki-source-47db8ab555df91361739a053
    resource: repo://packages/engine/src/index.ts
---

# Engine package overview

`@scene-grid/engine` is the runtime package that turns authored audio configuration into live playback, mix-state, and telemetry behavior.

## Public entry surface

The engine barrel exposes:

- `AudioEngine`
- `PRIORITY`
- `LoopState`
- the package-wide type surface for buses, snapshots, manifests, RTPC, banks, events, music FSM, and infrastructure adapters
- `WorkletLoader`

## Public API families

- [Audio engine façade](./application/audio-engine.md)
- [Validation pipeline](./domain/validation.md)
- [Mixer state and transitions](./domain/mixer.md)
- [Orchestration and music control](./domain/orchestration.md)
- [Routing and playback managers](./domain/router-and-managers.md)
- [Configuration and sound registry](./domain/configuration.md)
- [Infrastructure overview](./infrastructure/overview.md)

## Responsibilities

- own the package-level runtime facade;
- validate and freeze configuration on initialization;
- wire domain logic to infrastructure adapters;
- provide a stable export surface for downstream consumers and the example app.

## Representative tests

- `packages/engine/src/Application/__tests__/AudioEngine.test.ts`
- domain, manager, and infrastructure tests linked from the subsystem pages

## Scope boundary

This page is the package boundary map. The public API families and runtime behaviors are documented on the linked pages.
