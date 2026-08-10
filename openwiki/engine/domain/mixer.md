---
type: domain subsystem
title: Mixer state and transitions
description: Mixer snapshots, layer coordination, state resolution, and the timed transition engine that applies gains, filters, sends, and RTPC binding.
tags: [engine, mixer, snapshots]
---

# Mixer state and transitions

This subsystem owns mix-state composition and timed transition behavior.

## Owned modules

- `MixerCoordinator`
- `MixerLayer`
- `MixerSnapshotManager`
- `MixerStateResolver`
- `MixerTransitionEngine`
- `PRIORITY`

## Responsibilities

- combine base state and overlay layers into a resolved mixer snapshot;
- coordinate snapshot activation and clearing;
- apply timed transitions to bus gains, filters, sends, and RTPC bindings;
- preserve the cold-start behavior that applies the first resolved state instantly.

## Important invariants

- the first apply behaves as a cold start and should not require a fade;
- transitions split into a filter phase and a gain/send phase;
- locked transitions should ignore interruptions until the current transition completes or is cancelled;
- missing sends from the new target must clear prior sends instead of leaving stale routing in place.

## Representative tests

- `packages/engine/src/Domain/Mixer/__tests__/MixerCoordinator.test.ts`
- `packages/engine/src/Domain/Mixer/__tests__/MixerLayer.test.ts`
- `packages/engine/src/Domain/Mixer/__tests__/MixerSnapshotManager.test.ts`
- `packages/engine/src/Domain/Mixer/__tests__/MixerStateResolver.test.ts`
- `packages/engine/src/Domain/Mixer/__tests__/MixerTransitionEngine.test.ts`

## Relationship to other pages

`AudioEngine` uses this subsystem through its `mixer` facade, while the bus-system infrastructure page documents the node-level API that transitions ultimately drive.
