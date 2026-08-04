## Why

An abrupt state change in the game (like skipping a cutscene or animation) often leaves "phantom sounds" because audio engines rely heavily on lookahead scheduling and delayed events. A global, non-destructive way to flush pending events and sounds based on logical scopes (tags) is required to cleanly cancel these actions without stopping the entire audio engine abruptly.

## What Changes

- Add a new event action `cancel_pending` to `IEventConfig` and `EventAction` union that accepts a list of `targetTags`.
- Extend `IBaseEventAction` so that all event actions can be assigned to one or more logical groups (`tags?: string[]`).
- Update `AudioEventOrchestrator` to track active `PlaybackId`s and `SoundId` loops per tag, mapped in a zero-allocation flat array structure (`TrackedPlayback[]`).
- Update the `tick` method of `AudioEventOrchestrator` to perform GC-safe, zero-allocation garbage collection of dead `PlaybackId`s using a swap-and-pop technique.
- Implement the `cancel_pending` action handling inside `AudioEventOrchestrator` to flush `scheduledActions`, stop active tagged playbacks via `router.stop()`, and stop tagged loops via `sequencer.stopLoop()`.

## Capabilities

### New Capabilities
- `event-orchestrator-tag-flushing`: Mechanism for tagging event actions and flushing future or active audio operations by their associated tags.

### Modified Capabilities

## Impact

- **Domain Config Layer**: Expands configuration JSON structures (`IEventConfig`, `IBaseEventAction`) which allows users to declaratively tag events and issue cancel actions.
- **Domain Orchestration Layer**: `AudioEventOrchestrator` state logic expands. It acts as the sole manager of tags, preserving Data-Oriented Design by not leaking tagging concepts to lower Infrastructure or Router layers.
- **Performance**: Garbage collection of tracked playbacks is introduced in the hot path (`tick`). The implementation must strictly follow zero-allocation / swap-and-pop arrays to avoid triggering V8 GC.
- **Architectural Rules**: The dependency rule (inward to Domain) remains unbroken. `AudioEventOrchestrator` sits in the Domain layer and only interacts with Domain `IAudioRouter` and `ISequencer`. It does poll `ISoundController` for state, but this is an allowed injection for the Orchestrator. No tag logic propagates downward.
