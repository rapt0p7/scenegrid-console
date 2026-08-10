---
type: domain subsystem
title: Routing and playback managers
description: Audio routing, container and switch policies, ducking, RTPC binding, and the configuration-to-playback selection logic.
tags: [engine, routing, playback, rtpc]
---

# Routing and playback managers

This subsystem sits between authored configuration and concrete playback.

## Owned modules

- `AudioRouter`
- `VariationResolver`
- `ContainerPlaybackPolicy`
- `SwitchPlaybackPolicy`
- `DuckingManager`
- `InstanceRTPCBinder`

## Responsibilities

- resolve the concrete sound to play from the registry and configuration;
- apply container and switch selection policies;
- bind RTPC control to playback instances;
- coordinate ducking triggers and playback-side effects;
- keep routing decisions separate from the lower-level sound controller.

## Important invariants

- routing must respect the config-backed sound registry and not invent missing entries;
- container and switch selection depend on history registries owned by the infrastructure state layer;
- ducking and RTPC binding are post-selection concerns, not part of route resolution itself.

## Representative tests

- `packages/engine/src/Domain/Router/__tests__/AudioRouter.test.ts`
- `packages/engine/src/Domain/Managers/__tests__/ContainerPlaybackPolicy.test.ts`
- `packages/engine/src/Domain/Managers/__tests__/SwitchPlaybackPolicy.test.ts`
- `packages/engine/src/Domain/Managers/__tests__/DuckingManager.test.ts`
- `packages/engine/src/Domain/Managers/__tests__/InstanceRTPCBinder.test.ts`

## Scope boundary

This page covers selection policy and runtime playback wiring only. The manifest registry that feeds it is documented on the configuration page.
