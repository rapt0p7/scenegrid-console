---
type: infrastructure subsystem
title: Scheduling and culling
description: Engine ticker integration, playback scheduling, culling evaluation, and context-driven frame processing for active voices.
tags: [engine, scheduling, culling]
verified:
  - by: openwiki/0.5.1
    at: 2026-09-27T15:02:32.352Z
sources:
  - id: openwiki-source-4c5cf432a6783b64244bfe99
    resource: repo://packages/engine/src/Infrastructure/scheduling/EngineTicker.ts
  - id: openwiki-source-f017a0997a493c25b81d6599
    resource: repo://packages/engine/src/Infrastructure/scheduling/PlaybackScheduler.ts
---

# Scheduling and culling

This subsystem owns the timing loop that keeps the engine’s runtime graph moving.

## Owned modules

- `EngineTicker` is the global scheduling primitive.
- `PlaybackScheduler` schedules playback checks and region timing.
- `CullingRunner` drives culling decisions.
- `CullingContextProvider` exposes the state needed to evaluate culling.

## Responsibilities

- register periodic tasks with the ticker;
- process active buses and playbacks on a stable cadence;
- evaluate whether voices should remain active, virtualize, or resume;
- keep culling decisions separated from router or mixer responsibilities.

## Representative tests

- `packages/engine/src/Infrastructure/scheduling/__tests__/EngineTicker.test.ts`
- `packages/engine/src/Infrastructure/scheduling/__tests__/PlaybackScheduler.test.ts`
- `packages/engine/src/Infrastructure/scheduling/__tests__/CullingRunner.test.ts`
- `packages/engine/src/Infrastructure/scheduling/__tests__/CullingContextProvider.test.ts`

## Scope boundary

This page documents runtime scheduling and voice pressure handling only. It does not cover playback selection policy, which is owned by the domain manager pages.
