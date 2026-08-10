---
type: infrastructure subsystem
title: Worklets
description: Audio-thread and inspector worklet processors used for ducking, limiting, and metering.
tags: [engine, worklets, audio-thread]
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
