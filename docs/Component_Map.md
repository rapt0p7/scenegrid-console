# Project Component Map

> **Purpose.** Router "file → assignment by domains". Main token saver: the agent goes here **before** any `Glob`/`Grep`/`Read` over the code and often finds the necessary file immediately.

> After each task where new key files appear — point-update the necessary section. Do not rewrite the map entirely.

> **Record format.** Table "File → Purpose, 5-12 words per record". Not essays, but dry routes.

---

## `@scene-grid/shared` Package (Foundation / Shared Types)

*Location: `packages/shared/src/`*

| File                          | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `Types/Branded.ts`            | Branded types (`SoundId`, `PlaybackId`) for strict protection against invalid states  |
| `Types/Condition.ts`          | Algebraic operator types and unified DTO contracts for domain conditions              |
| `Math/SeededPRNG.ts`          | Deterministic pseudo-random number generator, safe for reproducible offline rendering |
| `Telemetry/TelemetryBatch.ts` | DTOs and contracts for batched Zero-Allocation telemetry transmission to DevTools     |

## `@scene-grid/engine` Package — Application Layer (Composition Root)

*Location: `packages/engine/src/Application/`*

| File                    | Purpose                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `AudioEngine.ts`        | Main facade (Composition Root), graph initialization point, and dependency injection |
| `Ports/IAudioEngine.ts` | Strict public API contract (Deep Module) for the game client                         |

## `@scene-grid/engine` Package — Domain Layer (Business Logic)

*Location: `packages/engine/src/Domain/`*

| File                                         | Purpose                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Configuration/SoundRegistry.ts`             | Domain repository for metadata and sound configurations independent of infrastructure  |
| `Orchestration/AudioEventOrchestrator.ts`    | Stateless execution machine for Data-Driven macros and temporal logic events           |
| `Orchestration/Sequencer.ts`                 | Orchestrator for interactive music (Smart Loops) and horizontal phase sequencing       |
| `Orchestration/SmartLoopTransitionPolicy.ts` | Calculation and validation of transitions between sequencer magnet regions             |
| `Mixer/MixerTransitionEngine.ts`             | VCA mixer mathematics and crossfade interpolation between bus states                   |
| `Mixer/MixerSnapshotManager.ts`              | Management of independent layers and mixer state snapshots                             |
| `Router/AudioRouter.ts`                      | Router for triggering audio resources and resolving complex logic containers           |
| `Managers/ContainerPlaybackPolicy.ts`        | Pure logic for variation selection (Random/Sequence) with No-Repeat hysteresis support |
| `Managers/SwitchPlaybackPolicy.ts`           | Deterministic state switching logic (Switch) with a dead zone algorithm                |
| `Shared/Evaluators/ConditionEvaluator.ts`    | Pure function for evaluating conditions (Schmitt Trigger) without side effects         |
| `Validation/ConsistencyChecker.ts`           | AOT dependency graph analyzer for detecting loops and invalid routes                   |

## `@scene-grid/engine` Package — Infrastructure Layer (Web Audio & State)

Location: `packages/engine/src/Infrastructure/`*

| File                                     | Purpose                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `busSystem/AudioBusSystem.ts`            | Physical management of the Web Audio bus graph, effects, and sidechain compression           |
| `instance/SoundPoolManager.ts`           | Zero-Allocation voice pool (`SoundInstance`) for strict polyphony and memory control         |
| `instance/SoundInstance.ts`              | Wrapper for `AudioBufferSourceNode` nodes, managing the lifecycle of a single physical voice |
| `loader/AudioBufferLoader.ts`            | In-memory cache loader for binary audio resources with batch request support                 |
| `loader/BankManagerAdapter.ts`           | Management of in-memory resources, pool invalidation, and garbage collection (GC)            |
| `loader/SoundController.ts`              | Infrastructure executor for router commands and source of Lifecycle telemetry events         |
| `state/SwitchHistoryRegistry.ts`         | Flat Data-Oriented cache of switch state history for hysteresis operation                    |
| `state/ContainerHistoryRegistry.ts`      | Storage for container playback history to prevent the machine-gun effect                     |
| `scheduling/EngineTicker.ts`             | Central 16ms loop (Time Injection) for all ITickable engine subsystems                       |
| `telemetry/TelemetryDispatcher.ts`       | Central collector of telemetry batches with In-Place mutation (Zero-Allocation pattern)      |
| `telemetry/TelemetrySnapshotter.ts`      | Capturing state snapshots (RTPC, Playbacks) via preallocated object pools                    |
| `telemetry/BrowserTelemetryTransport.ts` | Adapter for transporting metrics to the inspector (DevTools) via `postMessage` API           |
| `nodes/MasterOutput.ts`                  | Audio graph output point with a brickwall limiter and `silentTail` branch                    |

## `@scene-grid/engine` Package — Kernel Layer (Mathematical Core)

*Location: `packages/engine/src/Kernel/`*

| File                  | Purpose                                                                                |
| --------------------- | -------------------------------------------------------------------------------------- |
| `RTPC/RTPCManager.ts` | DOD processor for macro-parameters (Control Voltage) with interpolation and slew rates |

## `@scene-grid/inspector` Package (DevTools 2.0)

*Location: `packages/inspector/src/`*

> **Update Note:** This section has been expanded to reflect recent architectural shifts (Phase 11-13), including the introduction of visual graph routing, BroadcastChannel telemetry, and modern UI tokens.

| File                          | Purpose                                                                           |
|-------------------------------| --------------------------------------------------------------------------------- |
| `AudioDebugger.ts`            | DevTools 2.0 core, connecting the UI inspector with the engine's telemetry stream |
| `AudioDebugPanel.ts`          | Control panel (Tweakpane) for visual debugging of the mixer and RTPC              |
| `AudioProfiler.ts`            | Aggregator of performance metrics and active/virtual voice pool statistics        |
| `visualizers.ts`              | WebGL rendering of spectrum analyzers and RMS meters for the inspector            |
| `worklets/meter.processor.ts` | `AudioWorklet` for hardware-level volume (RMS) metering without UI blocking       |
| `ui/AudioGraph.tsx`           | Real-time signal graph and routing visualization based on React Flow              |

