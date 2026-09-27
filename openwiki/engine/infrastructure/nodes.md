---
type: infrastructure subsystem
title: Nodes and master output
description: Audio node factories, node-chain composition, and the final master-output path used by the engine bus system.
tags: [engine, audio-nodes, master-output]
verified:
  - by: openwiki/0.5.1
    at: 2026-09-27T15:02:32.352Z
sources:
  - id: openwiki-source-387972ee594d6475db41100d
    resource: repo://packages/engine/src/Infrastructure/nodes/AudioNodeFactory.ts
  - id: openwiki-source-c030c681033496e964d27890
    resource: repo://packages/engine/src/Infrastructure/nodes/MasterOutput.ts
  - id: openwiki-source-ac4b7f45cf61d79b294b8c17
    resource: repo://packages/engine/src/Infrastructure/nodes/NodeChain.ts
---

# Nodes and master output

This subsystem owns the concrete node objects and the final output path.

## Owned modules

- `AudioNodeFactory` creates node abstractions.
- `NodeChain` composes nodes into processing chains.
- `MasterOutput` owns the final output stage.

## Responsibilities

- create and connect audio nodes consistently;
- build per-voice or per-bus chains;
- expose the master input/output boundary that the bus system connects to;
- keep node lifecycle operations safe and testable.

## Representative tests

- `packages/engine/src/Infrastructure/nodes/__tests__/AudioNodeFactory.test.ts`
- `packages/engine/src/Infrastructure/nodes/__tests__/NodeChain.test.ts`
- `packages/engine/src/Infrastructure/nodes/__tests__/MasterOutput.test.ts`

## Scope boundary

This page describes the node wiring layer only. Plugins, filters, and sidechain processors belong on the plugins page, and bus ownership belongs on the bus-system page.
