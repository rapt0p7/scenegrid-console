---
type: domain subsystem
title: Orchestration and music control
description: Event orchestration, music FSM evaluation, smart-loop sequencing, scatterer behavior, and quantized transition logic.
tags: [engine, orchestration, music]
---

# Orchestration and music control

This subsystem owns event-driven runtime orchestration and music sequencing.

## Owned modules

- `AudioEventOrchestrator`
- `AudioGrid`
- `MusicConductor`
- `MusicFsmEvaluator`
- `ScattererOrchestrator`
- `Sequencer`
- `SmartLoopTransitionPolicy`

## Responsibilities

- translate events into runtime actions;
- coordinate loop playback, stingers, and quantized transitions;
- evaluate music FSM decisions and smart-loop boundaries;
- schedule play/stop behavior with lookahead and region timing;
- keep orchestration logic separated from routing and mixer state resolution.

## Important invariants

- loop and stinger scheduling should respect quantization and lookahead rules;
- transition behavior should be driven by music-state data rather than ad hoc UI logic;
- recursive or delayed event actions need guards to avoid runaway dispatch;
- smart-loop transitions should be handled through policy rather than hard-coded in the caller.

## Representative tests

- `packages/engine/src/Domain/Orchestration/__tests__/AudioEventOrchestrator.test.ts`
- `packages/engine/src/Domain/Orchestration/__tests__/AudioGrid.test.ts`
- `packages/engine/src/Domain/Orchestration/__tests__/MusicConductor.test.ts`
- `packages/engine/src/Domain/Orchestration/__tests__/MusicFsmEvaluator.test.ts`
- `packages/engine/src/Domain/Orchestration/__tests__/ScattererOrchestrator.test.ts`
- `packages/engine/src/Domain/Orchestration/__tests__/Sequencer.test.ts`
- `packages/engine/src/Domain/Orchestration/__tests__/SmartLoopTransitionPolicy.test.ts`

## Relationship to other pages

`AudioEngine.music` and `AudioEngine.conductor` are thin façades over this subsystem, while routing and manager pages supply the selection logic those operations consume.
