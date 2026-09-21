# dev_journal.md — SceneGrid Console / Hexagonal Audio Engine

> Architectural Decision Records (ADR-style) journal. Sections ❌ / ⚖️ / 🎯 are templates for manual notes.

---

## [Phase 0] Focus: Initial Setup — Web Audio Engine + Hexagonal Skeleton

* **Context/Problem:** Needed to lay the foundation: initialize the AudioContext, define the physical layout of layers, and establish dependency rules between them prior to starting feature development.
* **Solution:** Created the initial WebAudio engine (`feat(core): initial commit`). Followed by a reorganization into a hexagonal architecture — files were distributed across Domain / Infrastructure / Kernel / Application layers without altering runtime behavior. Configured tsconfig aliases and the bundler for layer-based path resolution. DSP adapters (`SidechainDucker`, `TinyLimiterNode`, `FiltersPlugin`) were moved from `Core` to `webaudio-core/plugins` so that the Domain layer does not depend on native `AudioNode`s.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 1] Focus: Strict Isolation of Domain from Web Audio API (Ports and Adapters)

* **Context/Problem:** The Domain layer had direct dependencies on `AudioBusSystem` and physical `SoundInstance` objects, which violated the Dependency Rule and made tests heavy — requiring the entire Web Audio API to be mocked.
* **Solution:** Physical objects were replaced with a branded `PlaybackId` in `AudioRouter`, `CullingSystem`, `SmartLoopManager`, and `RTPCBinder`. Extracted clean ports — `ISoundController`, `IAudioBusSystem`, `IRTPCAdapter`. `AudioBusSystem` was moved to Infrastructure. `AudioEngine` became the Composition Root, injecting adapters into Domain managers. Incidentally fixed bugs related to devirtualization and volume calculation for culling. Tests were migrated to use port mocks instead of complex Web Audio graphs.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 2] Focus: Branded Types — Systemic Implementation Across the Stack

* **Context/Problem:** `string` was being used everywhere as an identifier for various entities (`SoundId`, `BusId`, `PlaybackId`, `RegionId`, `GameParamId`, `LayerId`, `SnapshotId`). This created a false sense of compatibility and allowed identifiers of different entities to be mixed up at compile time.
* **Solution:** Introduced branded types via `Branded.ts`, which was moved from `Domain/Types` to `Shared/Types` (a global Shared layer). Branded types were consistently applied across ports, adapters, the router, the mixer, the RTPC system, and test fixtures. `GameParamId` replaced `string` in RTPC configurations; `RegionId` in `ISequencer`/`ISoundConfig`; `LayerId`/`SnapshotId` in `MixerSnapshotManager`. Along the way, cyclic barrel imports were removed.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 3] Focus: RTPC — Migration to Pull-Model and Data-Oriented Design

* **Context/Problem:** `RTPCManager` relied on push events (mitt) and an internal `setInterval`. `InstanceRTPCBinder` held a separate event listener for each RTPC target. This introduced overhead due to callback allocations, dirty-list tracking, and unpredictable GC (Garbage Collection) pauses.
* **Solution:** `RTPCManager` was migrated to a pull-model: events and `startLoop`/`stopLoop` were removed, and a public `tick(deltaTimeMs)` method was added. `InstanceRTPCBinder` was reorganized for data-oriented design — all bindings are stored in a flat array, and RTPC values are applied in a single cycle via `tickRTPC()`. Voice cleanup now uses a swap-and-pop approach. `AudioBus.tickRTPC` transitioned to polling `IRTPCAdapter` (pull), and the RTPC EventBus in `AudioBus` was removed. Removed the dependency on `worker-timers`.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 4] Focus: EngineTicker — Unified Scheduler for the Entire Engine

* **Context/Problem:** RTPC, CullingRunner, AutomationEngine, and BusSystem each had their own independent timers (`setInterval`, `requestAnimationFrame`, `worker-timers`). This led to unpredictable timing and prevented synchronized updates across systems.
* **Solution:** Introduced `EngineTicker` — a centralized scheduler based on the `ITickable` interface. It internally utilizes flat arrays and swap-and-pop for registering/unregistering tasks (zero-allocation). `CullingRunner` lost its dedicated timer — its `tick()` is now invoked externally. `AutomationEngine` swapped `rAF` for a subscription to the ticker. `AudioBusSystem` registered a 20ms callback to process `hotPathBuses`. `RTPCManager` and `MixerTransitionEngine` now receive `currentTime` in `tick()` for precise timing calculations. Introduced `TickerTaskId` for type-safe task registration.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 5] Focus: Mixer — Synchronous FSM, DeepReadonly, and Async Removal

* **Context/Problem:** `MixerCoordinator`, `MixerSnapshotManager`, and `activateSnapshot` returned Promises in places where the operation was functionally synchronous. `MixerStateManager` lacked a strict finite state machine, resulting in edge cases when transitions were interrupted.
* **Solution:** `MixerStateManager` was redesigned into a tick-based FSM with explicit states for filter-fade and main-transition phases, supporting interruptible/uninterruptible transitions and cold-start (instant) transitions. `recompute`, `setBaseState`, `clearLayer`, and `activateSnapshot` were updated to return `void`. `DeepReadonly` was applied to `MixerState`, `ITransitionOptions`, and the parameters of `recompute`/`setBaseState`. Branded `LayerId`/`SnapshotId`/`BusId` were propagated throughout the entire mixer logic.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 6] Focus: AudioBus — Topology Refactoring, Filters, and Immutability

* **Context/Problem:** `AudioBus` mixed a mutable config with the current filter state, lacked separate tap nodes for analysis/sidechain, and its filter swap logic failed to handle concurrent calls properly.
* **Solution:** The config was marked `readonly` with a deep clone in the constructor. Added `currentFilterConfig` as a separate, mutable filter state. `safeReplaceFilter` was reworked into an async method with a `swapState` object to handle concurrent calls and ensure clean fade-outs/fade-ins. Added getters: `inputNode` (public access to input gain), `duckerTapNode` (pre-filter, for sidechain), `analyzerTapNode` (post-filter, for debug/analysis). The filter bypass logic was clarified — ensuring a direct pre → post connection when no filter is present. Introduced an `initialize()` method in `AudioBusSystem` to enforce an explicit setup order.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 7] Focus: Sidechain — Automated Creation via Bus Config

* **Context/Problem:** `createSidechain` was exposed as a public method in `IAudioBusSystem` and `AudioEngine`. The user had to call it manually post-initialization, which broke the "config == single source of truth" invariant.
* **Solution:** `createSidechain` was removed from the public API. Sidechain creation is now automated within `AudioBusSystem.initialize()` based on a new `sidechain.enabled` field in `IBusConfig`. `ConsistencyChecker` was expanded: it validates the presence and type of `sidechain.enabled`, ensuring that ducking target buses explicitly have their sidechain enabled. `IAudioBusSystem` switched to using `AudioNodeLike` instead of `PlaybackId` for routing/sidechain operations — `SoundController` is now responsible for providing the required `AudioNode`.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 8] Focus: Voice Culling — Hysteresis, Data-Oriented Arbiter, Logical States

* **Context/Problem:** Culling suffered from rapid flickering (fast virtualization/devirtualization toggling) during minor volume fluctuations. Pausing was ignored — a paused sound could unexpectedly devirtualize and start playing if its volume increased.
* **Solution:** Introduced hysteresis in `VoiceCullingArbiter` (`hysteresisMs`): a sound is virtualized only if it remains below the threshold longer than the specified time limit (`muteTimers`). `CullingRunner.tick()` now receives `deltaTimeMs` from the ticker. `SoundController` tracks a `logicalState` ('playing'/'paused') for each voice, which the arbiter accounts for when making decisions. A paused sound will virtualize when volume drops, but it will not devirtualize as long as it remains paused. `SoundPoolManager.#findStealCandidate` prioritizes stealing non-looping sounds over looping ones. `CullingContextProvider` was introduced as an Infrastructure adapter, implementing `ICullingContext` and decoupling `CullingRunner` from direct dependencies on specific types.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 9] Focus: Playback Logic — Switch, Container (Recursion), EventMap, Condition Hysteresis

* **Context/Problem:** The engine previously supported only a basic player. There were no mechanisms for selecting a track based on an RTPC value (Switch), handling nested containers, triggering sequences of actions via external events, or safeguarding against condition jitter.
* **Solution:**
* **Switch sound type**: `SwitchPlaybackPolicy` selects a sound based on the RTPC value. It was integrated into `AudioRouter`. `SwitchHistoryRegistry` stores the last state for hysteresis. `SwitchPlaybackPolicy` was refactored into an `evaluateNext(prevState) → nextState` pattern.
* **Container (recursion)**: `AudioRouter` now supports recursive playback of containers (up to a depth ≤ 10). `ContainerPlaybackPolicy` handles weighted sources, sequence mode with history tracking, and imposes history limits to prevent memory leaks.
* **EventMap / AudioEventOrchestrator**: Using `postEvent` on the facade triggers sequences of actions (play, stop, setRTPC, pause, resume). `IEventConfig`/`IStopOptions` define the event structure. Added a `tail` parameter to `ISoundConfig` for smooth endings.
* **Condition Hysteresis**: `ConditionEvaluator` was expanded to handle hysteresis parameters. `SmartLoopTransitionPolicy` now uses `ConditionEvaluator` with a magnet state. `ConsistencyChecker` validates against negative hysteresis values.



*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 10] Focus: Scheduler and Sequencer — Zero-Allocation and Pickup/Tail Regions

* **Context/Problem:** `Scheduler` used a `Map` to store slots, triggering allocations on every event. `Sequencer` lacked support for musical "pickups" (pre-entry) and "tails" (overlapping after a region ends).
* **Solution:** `Scheduler` was migrated to a slot-based approach: utilizing preallocated arrays for `ISoundInstance`, start/stop times, and callbacks. Added a capacity limit and slot reclamation functionality. `Sequencer` was expanded with `preEntryMs` / `tailMs` parameters in the region definition and `tailDurationMs` in options. `ConsistencyChecker` now validates these new parameters. Updated `ISequencer` and `ISoundConfig`.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 11] Focus: Telemetry — Full-Fledged Engine Observability System

* **Context/Problem:** The engine acted as a "black box" — there was no way to observe voice states, RTPC values, culling decisions, or the flow of events in real-time.
* **Solution:** Built a multi-tiered telemetry system:
* **TelemetryDispatcher** for packet batching; **TelemetrySnapshotter** for periodic snapshots of RTPC, switch states, and active playbacks.
* `SoundController` emits `LIFECYCLE` events (start, stop, pause, resume, virtualize, revive).
* `AudioEventOrchestrator` and `AudioRouter` emit `CAUSE_CHAIN` events for blocked actions.
* `VoiceCullingArbiter` and `SmartLoopTransitionPolicy` were equipped with detailed tracing.
* `SoundPoolManager` now returns a `RejectReason` instead of `null`.
* The transport layer was switched from `BrowserTelemetryTransport` to `BroadcastTelemetryTransport` (BroadcastChannel), making data accessible across different tabs/windows.
* Introduced **CyclePool** for telemetry objects (`CAUSE_CHAIN`, `LIFECYCLE`, snapshot data) — prioritizing reuse over allocation per event. Similarly pooled lifecycle events were added in the loader.
* `AudioBus` and `AudioBusSystem` expose gain values (logical, rtpc, final) and sidechain gain for snapshotting.
* The Engine dispatches a configuration manifest upon initialization so external tools are aware of available resources.
* Time handling in `SoundController`, `AudioEventOrchestrator`, and `AudioRouter` was unified using `getCurrentTime() * 1000` instead of `performance.now()`.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:** Expand and deepen telemetry to cover more of the audio engine.

---

## [Phase 12] Focus: AudioGraph Inspector — Signal Graph Visualization

* **Context/Problem:** While Telemetry provided raw data, developers lacked an intuitive visual of the routing topology: connected buses, active sidechain routes, and currently playing SoundInstances.
* **Solution:** Added an `AudioGraph` component to the Inspector, built on React Flow + ELK.js. Nodes represent buses, the master output, and active SoundInstances. Edges represent connections and active sidechain routes. The graph updates in real-time based on telemetry snapshots. ELK.js handles the automatic layout positioning.
* The Inspector UI was migrated to Radix UI Colors: component styles, the Tailwind config, and CSS variables were updated to use semantic color tokens, establishing a single source of truth for the theme.
* The debugger now uses the `analyzerTapNode` instead of `postFilterGain` for accurate bus analysis.

*Manual notes (to be filled):*

* **❌ What didn't work:** @projectstorm/react-diagrams - does not work with modern React. Litegraph.js - it's hard to change, customize, and make it work the way it should.
* **⚖️ Trade-off:**
* **🎯 Next step:** Implement `	Cause Chain Timeline` - a way to travel back in time and inspect the state of entire system.

---

## [Phase 13] Focus: Build — Webpack to Vite Migration, npm Workspaces Monorepo

* **Context/Problem:** The project grew and needed a strict separation between the runtime library, the inspector, and shared code. The Webpack configuration failed to provide correct type generation for worklet modules. A production-ready build with cross-package type resolution was necessary.
* **Solution:** The monorepo was migrated to use npm workspaces (`packages/*` + `examples`). Webpack was replaced with Vite for the library-build and the demo. Introduced `vite-worklet-isolator.ts` to properly resolve AudioWorklet modules. `vite-plugin-dts` was standardized across all packages; resolved TS6059/TS6305 issues (decoupling source tsconfig from build tsconfig). Organized packages: `@scene-grid/engine`, `@scene-grid/inspector`, `@scene-grid/shared`. Set up TypeDoc to generate API documentation. Added repomix as a hook to auto-generate `docs/Project_Source_Code.md`.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 14] Focus: AudioEngine Facade — HMR, Lifecycle Events, Pause/Resume

* **Context/Problem:** The engine previously required a full restart to apply configuration changes in dev mode. The public API lacked events for tracking the loading state and context lifecycle. Pausing was absent as a first-class operation.
* **Solution:**
* **HMR**: Added `_hotReloadConfig` on `AudioEngine` and `updateConfig` on `AudioBusSystem` to allow dynamic updates to buses/snapshots/soundMap/RTPC without restarting the AudioContext. `MixerSnapshotManager` received `updateSnapshotsConfig`. Accounted for race conditions when updating sends.
* **Event system**: Created `EngineEventDispatcher` with typed `IEngineEvents`. Exposed public APIs like `engine.events.on/off/once/clear`. Lifecycle events added: `engine:ready`, `engine:error`, `state:suspended`, `state:resumed`. Load events: `load:start`, `load:progress`, `load:complete`. Handled tab visibility and suspension states.
* **Pause/Resume**: Implemented a `logicalState` ('playing'/'paused') on each voice in `SoundController`. Culling logic now respects this logical state. `AudioRouter` and `AudioEngine` publicly expose `pause`/`resume` methods. Added a micro-fade-out upon calling `stop()` to prevent audio clicking.
* **`loadBatch`**: Implemented asynchronous loading for multiple AudioBuffers, complete with `onProgress`/`onError` callbacks. Added a fallback to a dummy buffer if decoding fails.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 15] Focus: AudioWorklet — IAudioWorkletProcessor Removal, Native TS Types

* **Context/Problem:** A custom `IAudioWorkletProcessor` interface duplicated the native `AudioWorkletProcessor` without providing any real benefit. Using a custom global scope instead of the built-in `audioworklet` library caused type confusion.
* **Solution:** Removed `IAudioWorkletProcessor`; processors now extend `AudioWorkletProcessor` directly. TypeScript types were switched over to the built-in `audioworklet` lib. Processors were moved from `plugins` to `worklets` to improve modularity. Incidentally, removed redundant "Processor" suffixes from the class names.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 16] Focus: Memory Management — Audio Bank Loading and Unloading

* **Context/Problem:** Relying solely on loading individual audio buffers is insufficient for complex applications, leading to memory bloat if assets are not managed properly. The engine needed a structured way to load and, more importantly, unload groups of sounds based on the current context or scene.
* **Solution:** Implemented a comprehensive Bank loading and unloading system. This system builds upon the asynchronous `loadBatch` functionality, allowing developers to group `AudioBuffer` assets into logical banks. Unloading a bank safely releases the associated audio memory. Handled edge cases regarding active playbacks during bank unloading to ensure no dead references or audio glitches occur.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 17] Focus: Advanced Playback — Scatterer, Stingers, Cooldowns, and Determinism

* **Context/Problem:** The engine's sound design capabilities needed expansion to support spatial randomization, musical transitions, and rate-limiting. Furthermore, randomized playback (variations, spatial spread) made automated testing and debugging difficult due to non-deterministic behavior.
* **Solution:** - **Scatterer & Stingers:** Implemented the `Scatterer` sound type for automated spatial distribution of sounds. Added quantizable stinger playback, allowing sounds to be triggered exactly on musical beats or intervals.
* **Determinism:** Introduced a seeded Pseudo-Random Number Generator (PRNG) for deterministic variations, ensuring tests and specific game seeds produce identical audio outcomes.
* **Cooldowns:** Added a cooldown mechanism to the `play` method (using unified engine time) to prevent rapid event spamming from overwhelming the voice pool.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 18] Focus: Core Polish — TypeScript 6.0, ESM, and Advanced Routing Invariants

* **Context/Problem:** The ecosystem was falling behind modern JavaScript standards, slowing down the build and linting pipelines. On the audio routing side, sidechaining lacked fine-grained control (all sources ducked equally), and misconfigured routing could lead to infinite loops or "ghost ducking" (ducking triggered by silent/virtual voices incorrectly).
* **Solution:**
* **Tech Stack:** Migrated the entire codebase to TypeScript 6.0 and pure ESM imports. Switched to `oxlint` and `oxfmt` to significantly speed up linting and formatting.
* **Sidechain Polish:** Added per-source intensity gain for sidechain ducking, allowing different sounds to trigger the ducker at different strengths. Implemented virtual voice auto-end to cleanly dispose of virtualized voices while preserving their sidechain contributions.
* **Safety Invariants:** Expanded `ConsistencyChecker` to include routing cycle detection (preventing feedback loops) and ghost ducking risk validation.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 19] Focus: Cause Chain Timeline, Deep Node Inspection & Observability Polish

* **Context/Problem:** As outlined in the "Next step" of Phase 12, developers needed a "Cause Chain Timeline" — a way to travel back in time and inspect the system's state to trace transient bugs. Additionally, the `AudioGraph` visualized connections well but lacked granular, node-level insight into exactly *why* a sound was culled, or what exact gain modifiers (logical, RTPC, sidechain) were currently applied to a specific bus.
* **Solution:**
* **Timeline Scrubbing:** Introduced a new `TimelineScrubber` component and `useSnapshotTimeline` hook. Users can now pause the live telemetry feed, scrub back and forth through historical snapshots, and inspect specific events across both the `PerformanceGraph` and the `AudioGraph`.
* **Node Inspector:** Built a dedicated `NodeInspector` panel into the `InspectorApp`. Clicking on playback or bus nodes now reveals detailed real-time (or historical, via timeline) state data.
* **Deep Telemetry:** Extended core domain models to track new data points for telemetry: `SoundController` now exposes `VirtualReason` (including `ArbiterCullReason`), and `AudioBusSystem` reports its active gain `modifiers`. This data is aggregated in `TelemetrySnapshotter` and displayed in the Node Inspector. Also added telemetry tracking and highlighting in logs for mixer snapshot changes.
* **Architecture Documentation Update:** Systematized recent progress by updating `ARCHITECTURE.md` (and RU version) to explicitly detail HMR capabilities, the Bank Loading system, Data-Oriented Design (DOD) optimizations (swap-and-pop), and voice culling hysteresis windows. Diagram updates were also synced.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:** `What if simulator` - a way to tweak and call methods on audio engine through Inspector 2.0.

---

## [Phase 20] Focus: What-If Simulator, Debug API, and Consistency Reporting UI

* **Context/Problem:** As outlined in Phase 19, there was no way to dynamically interact with the audio engine from the Inspector. Testing specific audio states (changing RTPCs, firing events, or forcing Switch states) required manual in-game setup or hardcoding values. Additionally, while the `ConsistencyChecker` validated the engine configuration, its results were confined to the engine side and not clearly visible to developers using the DevTools, risking silent configuration failures.
* **Solution:**
* **Inspector Debug API & IPC:** Established two-way communication by introducing `IInspectorDebugPort` in the Domain Shared layer and `InspectorCommand` types in the Shared package. Implemented `CommandReceiver` in Infrastructure via `BroadcastIpcAdapter` to process incoming debug instructions.
* **Engine Overrides:** Extended `RTPCManager` and `SwitchHistoryRegistry` to support state overrides, integrating these temporary debug modifications directly into the `AudioRouter` logic. Refactored `mixer.setState` to support optional crossfade durations.
* **What-If Simulator UI:** Built a new panel in the `InspectorApp` that uses the `useCommandTransmitter` hook to dispatch commands. Developers can now manually trigger `events`, tweak `RTPC` parameters, override `Switch` states, and use global transport controls (`STOP_ALL`, `PAUSE_ALL`, `RESUME_ALL`, clear overrides). Expanded `IEngineManifestDTO` to expose events and the RTPC manifest to the UI.
* **Consistency Reporting:** Created the `IConsistencyReporter` port with `ConsoleReporter` and `TelemetryConsistencyReporter` implementations. The `ConsistencyChecker` now dispatches validation reports via the telemetry bus during setup and hot-reloads. The Inspector consumes these via `useTelemetryBus` and displays a collapsible status panel in the header, bringing critical configuration errors and warnings to the immediate attention of the user.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:** Finalization v1.1 milestone.

---

## [Phase 21] Focus: Zero-Allocation Interactive Music Conductor (FSM)

* **Context/Problem:** The engine required a data-driven finite state machine (FSM) to orchestrate complex interactive music transitions based on Game State (RTPCs). The initial proposal relied on Redux-style immutable DTOs (`MusicCommand`), which clashed with the engine's strict Zero-Allocation/GC-Safety requirements. Furthermore, musical scheduling lacked sample-accurate integration between the sequencer and mixer.
* **Solution:** * **Zero-Allocation FSM:** Implemented `MusicConductor` as a direct, state-mutating class (`IConductorState`) operating on the `ITickable` polling model. It evaluates transitions using a pure function (`evaluateEdges`) and delegates execution directly to `ISequencer` and `MixerSnapshotManager` without allocating intermediate objects.
    * **AudioGrid Encapsulation:** Extracted all fractional grid math (`NextGridDivision`, `ExactPulse`) natively into the `AudioGrid` class, ensuring drift-free integer calculations for precise scheduling.
    * **Crossfade & Absolute Scheduling:** Migrated internal `Sequencer` and `SoundController` scheduling from relative delays to absolute timestamps. Introduced a dedicated `crossfade` API utilizing the Web Audio API's `cancelScheduledValues` for smooth, overlapping transitions.
    * **Static Validation:** Integrated `checkMusicFSM` into `ConsistencyChecker` to proactively validate graph integrity, region existence within `smartLoop` assets, snapshot definitions, and RTPC bindings.
    * **Lifecycle and Demo:** Added strict `init`, `start`, and `stop` lifecycle methods to ensure safe execution post-context-unlock. Updated the examples to demonstrate `MusicFSM` and `smartLoop` in action.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:** Type-safe API autocomplete and validation decomposition.

---

## [Phase 22] Focus: Type-Safe API Autocomplete, TimeMath, and Validation Decomposition

* **Context/Problem:** The API surface lacked strict type safety for string-based identifiers, limiting IDE autocomplete and developer experience. The `ConsistencyChecker` was growing into a large monolithic class, making it harder to maintain. Time-based calculations were scattered and lacked a unified, type-safe approach. The Inspector also needed interactive controls for the newly introduced music sequencer.
* **Solution:**
    * **API Autocomplete:** Introduced `SceneGridRegistry` to provide type-safe API autocomplete, allowing developers to benefit from IDE suggestions for audio events, buses, and RTPC parameters.
    * **Time Utilities:** Implemented time branded types and a unified `TimeMath` utility to standardize and type-check time calculations across the engine.
    * **Validation Refactoring:** Decomposed the monolithic `ConsistencyChecker` into smaller, focused validator classes to improve maintainability and separation of concerns.
    * **Inspector Updates:** Added interactive music sequencer controls to the Inspector, enhancing the What-If Simulator with sequencing capabilities.
    * **Tooling:** Integrated new Repowise skills, updated the NotebookLM script, and added an SVG diagram generation script to improve architecture documentation and agent workflows.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 23] Focus: Resource Management — RAM Quota and Concurrency Throttling

* **Context/Problem:** Unbounded loading of audio assets could lead to memory exhaustion, especially on constrained devices. Additionally, executing too many asynchronous tasks (like fetching and decoding) simultaneously could overwhelm the network and CPU, causing performance degradation.
* **Solution:** Introduced a RAM Quota Manager with an LRU (Least Recently Used) eviction policy in the loader layer to strictly manage memory usage. Implemented a `ConcurrencyThrottler` in the shared layer to control the rate of concurrent asynchronous tasks, ensuring smoother operation during heavy asset loading.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 24] Focus: Robust AudioWorklet Loading and Action Cancellation

* **Context/Problem:** `AudioWorklet` loading could be brittle or fail silently without proper tracking or error recovery. Additionally, the event orchestrator lacked the ability to tag specific actions or cancel pending actions that were scheduled (e.g., via delays), making it difficult to interrupt complex event sequences once triggered.
* **Solution:** Introduced `WorkletLoader` in the infrastructure layer to ensure robust loading and registration of AudioWorklets. In the orchestration layer, added support for event action tagging and a `cancel_pending` action type, complete with domain validation. This allows developers to tag delayed or probabilistic actions and explicitly cancel them before execution if game state changes.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 25] Focus: Inspector Decoupling, Deterministic Scheduling, and Test Rigor

* **Context/Problem:** The `inspector` was tightly coupled to the `engine`, potentially impacting runtime performance and preventing it from running reliably in an isolated environment. Additionally, scheduling needed to be more deterministic regardless of frame rate fluctuations, and the test suite required stronger validation against false positives.
* **Solution:** Decoupled the `inspector` from the `engine` utilizing a Proxy architecture and a `SharedWorker` for synchronization, enabling the DevTools to run in complete isolation. Introduced a tick divider for deterministic scheduling. Finally, strengthened the test suite by integrating mutation testing and implemented the `OpenWiki` documentation system for continuous knowledge management.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 26] Focus: Audio Streaming, AOT Asset Pipeline, and Remote Telemetry

* **Context/Problem:** Loading large audio files entirely into memory could exhaust RAM quotas, highlighting the need for efficient streaming. Audio assets also lacked an automated preparation step, and telemetry synchronization for the DevTools required a more robust mechanism for remote connections.
* **Solution:** Added a chunked audio streaming pipeline in the infrastructure layer to handle large assets efficiently without memory bloat. Introduced a CLI asset pipeline for Ahead-of-Time (AOT) audio processing and manifest generation. Implemented a Live Bridge for remote telemetry synchronization, and integrated the `keep-the-why` architecture skill for better context preservation.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Phase 27] Focus: Telemetry API (MCP) and Architectural Resiliency (Result Monad)

* **Context/Problem:** External tooling and AI agents lacked a standardized, unified API to query real-time engine telemetry or dynamically control engine states. Furthermore, error handling relied heavily on exceptions, which could cause unpredictable crashes or undefined behavior during edge cases or asset loading failures.
* **Solution:** Introduced a Model Context Protocol (MCP) server to provide standardized access to engine telemetry and control APIs. Transitioned the architectural error handling toward a safer model by implementing a Result monad pattern alongside explicit degradation policies, ensuring the engine fails gracefully. Additionally, established explicit Repowise usage rules for autonomous agents.

*Manual notes (to be filled):*

* **❌ What didn't work:**
* **⚖️ Trade-off:**
* **🎯 Next step:**

---

## [Architectural Invariants] Documented Rules (from docs/architecture commits)

The following explicit rules have been locked in the documentation:

* **Domain zero side-effects**: Control-plane structures must not be mutated within the Domain.
* **Primitive identity forbidden**: Using strings as IDs for domain entities is strictly prohibited — branded types must be used exclusively.
* **Data-plane exception**: In Infrastructure and Orchestration layers, in-place mutations are **mandatory** (following Data-Oriented Design to prevent GC spikes). `DeepReadonly` does not apply to the data plane.
* **Multiplicative Veto**: Documented and validated within `ConsistencyChecker` — a base gain and a snapshot override cannot simultaneously zero out the resulting gain unpredictably.
