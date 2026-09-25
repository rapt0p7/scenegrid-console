---
type: infrastructure overview
title: Engine infrastructure overview
description: Map of the Web Audio adapters, loaders, scheduling, telemetry, state, and worklet subsystems behind the engine package.
tags: [engine, infrastructure, web-audio]
verified:
  - by: openwiki/0.5.1
    at: 2026-09-25T08:14:31.202Z
sources:
  - id: openwiki-source-0c3d4233b100c93352d0e0b4
    resource: repo://packages/engine/src/Infrastructure/index.ts
---

# Engine infrastructure overview

This page maps the concrete runtime adapters behind the engine’s domain logic.

## Subsystem pages

- [Context and unlock management](./context.md)
- [Bus system](./bus-system.md)
- [Nodes and master output](./nodes.md)
- [Plugins, sidechain, and limiter](./plugins.md)
- [Scheduling and culling](./scheduling.md)
- [Loaders and bank management](./loader.md)
- [Sound instances and pooling](./instance.md)
- [Runtime state registries](./state.md)
- [Telemetry transports](./telemetry.md)
- [Worklets](./worklets.md)

## Responsibilities

- translate domain decisions into Web Audio graph operations;
- manage browser-specific capabilities and failure modes;
- keep stateful runtime adapters testable in isolation;
- expose the lower-level collaborators consumed by `AudioEngine`.

## Representative tests

The subsystem pages list their own focused tests; the package-level anchor is the `packages/engine/src/Infrastructure/**/__tests__` suite.

## Scope boundary

This page is only the map for engine infrastructure. The detailed behavior belongs to the linked subsystem pages.
