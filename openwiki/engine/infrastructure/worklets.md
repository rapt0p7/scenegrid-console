---
type: infrastructure subsystem
title: Worklets
description: Audio-thread and inspector worklet processors used for ducking, limiting, and metering.
tags: [engine, worklets, audio-thread]
verified:
  - by: openwiki/0.5.1
    at: 2026-09-27T15:02:32.352Z
sources:
  - id: openwiki-source-f7ce4eb73c6c314317e5578a
    resource: repo://packages/engine/src/Infrastructure/worklets/ducker.processor.ts
  - id: openwiki-source-296e37a5b6b009a3bf142c63
    resource: repo://packages/engine/src/Infrastructure/worklets/lookahead-brickwall-limiter.processor.ts
---

# Worklets

This subsystem owns the worklet processors used by the runtime engine.

## Owned modules

- `ducker.processor`
- `lookahead-brickwall-limiter.processor`
- related worklet tests

## Responsibilities

- run DSP logic on the audio thread;
- support lookahead ducking behavior;
- implement limiter processing with predictable timing;
- remain isolated from UI code and easy to test as processors.

## Representative tests

- `packages/engine/src/Infrastructure/worklets/__tests__/ducker.processor.test.ts`
- `packages/engine/src/Infrastructure/worklets/__tests__/lookahead-brickwall-limiter.processor.test.ts`

## Scope boundary

Inspector worklets live in the inspector package, while engine worklets live here.
