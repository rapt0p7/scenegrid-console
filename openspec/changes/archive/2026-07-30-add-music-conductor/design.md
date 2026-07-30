# Design: Interactive Music Conductor

## 1. Domain Configuration (`IMusicFSMConfig`)

State definitions and transitions are described declaratively as an immutable data manifest.

```typescript
export interface IMusicFSMConfig {
    readonly initialState: MusicStateId;

    // Evaluated first. Overrides local transitions of the current state.
    readonly globalEdges: ReadonlyArray<IMusicTransitionEdge>;

    readonly states: Record<MusicStateId, IMusicStateNode>;
}

export interface IMusicStateNode {
    readonly id: MusicStateId;
    readonly soundId: SoundId; // The sequencer uses this ID to apply transition rules
    readonly sequencerRegion: RegionId;
    readonly activeSnapshot?: SnapshotId;
    readonly edges: ReadonlyArray<IMusicTransitionEdge>;
}

export interface IMusicTransitionEdge {
    readonly targetState: MusicStateId;
    readonly conditions: ReadonlyArray<IConditionConfig>; // Standard engine conditions (supports hysteresis)
    readonly syncRule: QuantizeType;
    readonly crossfadeDurationMs?: number;
    readonly transitionRegionName?: RegionId;
    readonly stingerId?: SoundId;
    readonly interruptable: boolean;
}

```

## 2. Zero-Allocation Execution

Instead of using command abstractions (`MusicCommand` DTOs) and allocating memory for arrays on every tick, `MusicConductor` interacts directly with the audio engine's interfaces. This guarantees zero Garbage Collection (GC) overhead at runtime.

* **Sequencer:** Transitions and stingers are delegated to `ISequencer.transitionTo` and `ISequencer.playStinger`. The sequencer handles its own internal scheduling based on the `AudioGrid`.
* **Mixer:** Snapshot switching for vertical orchestration is cached in the conductor's flat state and applied exactly at the calculated musical moment.

## 3. State and Lifecycle (`IConductorState`)

To track deferred mixer transitions without allocating new objects, the `IConductorState` is initialized once upon class creation and mutated by reference.

```typescript
export interface IConductorState {
    currentStateId: MusicStateId;
    readonly pendingMixer: {
        isActive: boolean;
        executionTime: number;
        snapshotId: SnapshotId;
        crossfadeMs: number;
    };
    isTransitioning: boolean; // Blocks repeated FSM evaluations until the current musical transition is complete
}

```

Playback management is divided into three phases:

1. `init(config)`: Loads the FSM configuration and prepares the flat state structure. Playback does not start, and no API calls are made.
2. `start()`: Called strictly after the user unlocks the AudioContext and audio banks are fully loaded. Starts the initial musical loop and the initial mixer snapshot.
3. `stop()`: Stops the current musical loops, resets transition flags, and puts ticking into a sleep state.

## 4. Musical Grid Synchronization

Calculating the exact time (`targetTime`) for deferred mixer switching occurs inside `MusicConductor.tick`. The conductor queries the current musical grid from the Sequencer via `getPlaybackInfo(soundId).grid` and uses `AudioGrid` integer math (without float drift) for quantization:

* Bar (`NextBar`) and beat (`NextBeat`) synchronization.
* Grid division (`NextGridDivision`) and exact pulse (`ExactPulse`) synchronization.

## 5. Static Validity Analysis (`ConsistencyChecker`)

To prevent runtime crashes (calls to non-existent regions, grid logic hangs, silence due to missing sounds), the `MusicFSM` configuration undergoes a full static analysis before execution:

* **Graph Validation:** Verifies the existence of `initialState` and all `targetState` references on transition edges.
* **Asset Validation:** Verifies the existence of `soundId` in `soundMap` and ensures the sound type is strictly defined as `smartLoop`.
* **Region Validation:** Ensures that `sequencerRegion` and `transitionRegionName` (fills) exist within the declared regions dictionary of the specific `smartLoop` asset.
* **Mixer & Parameter Validation:** Verifies the existence of `activeSnapshot` in the mixer configuration and the availability of all `param` entries in the global `RTPCManifest`.
