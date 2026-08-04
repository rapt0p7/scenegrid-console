## Context

See proposal.md for motivation. The engine currently lacks a clean mechanism to flush a specific subset of pending audio actions (like those spawned by skipping a cutscene) without doing a hard reset of all audio layers.

## Goals / Non-Goals

**Goals:**
- Provide a GC-safe, zero-allocation mechanism within the hot path (`tick`) to track and manage tagged events.
- Allow `cancel_pending` actions to flush `scheduledActions`, stop active tagged playbacks, and stop active tagged loops cleanly via existing domain logic.
- Isolate all tagging and scoping logic entirely within `AudioEventOrchestrator` to strictly follow DOD and architectural constraints (no leaking game-level logic to Infrastructure).

**Non-Goals:**
- Extending `IAudioRouter`, `ISequencer`, or `ISoundController` with tag awareness.
- Replacing the core scheduling mechanics in Infrastructure layers.
- Global hard-stop mechanism across all systems.

## Decisions

### 1. Tagging Logic Isolation
**Decision:** All tag state is managed exclusively by `AudioEventOrchestrator`.
**Rationale:** Preserves strict layer isolation. `SoundController` and `AudioRouter` remain unaware of high-level game concepts (tags). The Orchestrator simply maps tags to `PlaybackId` and `SoundId` and translates cancellations into standard `stop()` calls.
**Alternatives Considered:** Passing tags down into `AudioRouter` and `SoundController`. Rejected because it leaks game-level scoping logic into low-level DSP infrastructure.

### 2. Zero-Allocation Tracking in the Hot Path
**Decision:** Use a flat array (`TrackedPlayback[]`) and a backward-iterating `for` loop with swap-and-pop technique inside `AudioEventOrchestrator.tick()`.
**Rationale:** The `tick` method runs at 60 FPS (hot path). Iterating over standard JavaScript `Map` or `Set` collections generates iterator objects, triggering GC pressure. The swap-and-pop method avoids both `splice()` shifting allocations and iterator allocations.
**Alternatives Considered:** `Map<string, Set<PlaybackId>>`. Rejected due to heavy iterator allocations and GC non-compliance in the hot path.

### 3. State Polling via ISoundController
**Decision:** The Orchestrator will poll `soundController.getPlaybackState(playbackId)` in its `tick` method to garbage-collect dead tracked playbacks.
**Rationale:** There is no global `EngineEvents` for individual playback completion. The $O(1)$ lookup in the tick loop is highly efficient and non-destructive to existing interfaces.

## Risks / Trade-offs

- **Risk:** `trackedPlaybacks` array grows continuously if voices don't end and aren't canceled.
  - **Mitigation:** The polling mechanism inside the `tick` loop guarantees garbage collection as soon as the voice state reaches `'stopped'`.
- **Trade-off:** `AudioEventOrchestrator` must iterate through all tracked playbacks every 16ms tick.
  - **Mitigation:** The number of concurrently tracked, tagged events is generally small (< 100), and the operations (array access, $O(1)$ state lookup, swap-and-pop) are extremely fast in V8.
