---
type: infrastructure subsystem
title: Sound instances and pooling
description: Runtime sound-instance objects and pool management used to avoid allocation churn and manage playback reuse.
tags: [engine, pooling, sound-instance]
---

# Sound instances and pooling

This subsystem owns the runtime object model for individual sound playbacks.

## Owned modules

- `SoundInstance` represents a live playback instance.
- `SoundPoolManager` manages reuse and lifecycle of instances.

## Responsibilities

- create reusable playback instances;
- connect and disconnect sound graphs safely;
- avoid allocation churn during heavy gameplay;
- keep per-instance state isolated enough for testing and reuse.

## Representative tests

- `packages/engine/src/Infrastructure/instance/__tests__/SoundInstance.test.ts`
- `packages/engine/src/Infrastructure/instance/__tests__/SoundPoolManager.test.ts`

## Scope boundary

This page is about individual playback objects and pool behavior. Higher-level selection and routing policy belong to the domain pages, and concrete node wiring belongs to the nodes page.
