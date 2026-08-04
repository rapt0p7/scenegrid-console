## 1. Domain Configuration Updates

- [x] 1.1 Write failing test for parsing new event action shapes (`tags` property and `cancel_pending` action type) in configuration parser.
- [x] 1.2 Update `IEventConfig.ts` to include `tags?: string[]` on `IBaseEventAction`.
- [x] 1.3 Update `IEventConfig.ts` to include `ICancelPendingAction` in the `EventAction` union.
- [x] 1.4 Update any related configuration parsing/validation logic to support the new types.
- [x] 1.5 Verify configuration parsing tests pass.

## 2. AudioEventOrchestrator Tracking Implementation

- [x] 2.1 Write failing test for `AudioEventOrchestrator` tracking playbacks correctly (mock `router.play` returning a `PlaybackId`).
- [x] 2.2 Add `TrackedPlayback` interface (zero-allocation structure) and `trackedPlaybacks: TrackedPlayback[]` array to `AudioEventOrchestrator`.
- [x] 2.3 Update `executeAction` to push `{ playbackId, tags }` into `trackedPlaybacks` when `router.play()` returns valid IDs and action has `tags`.
- [x] 2.4 Verify tracking tests pass.

## 3. Zero-Allocation Garbage Collection

- [x] 3.1 Write failing test for `tick()` cleaning up stopped playbacks using a mocked `soundController.getPlaybackState()`.
- [x] 3.2 Implement backward-iterating `for` loop in `AudioEventOrchestrator.tick()` using swap-and-pop technique to remove stopped playbacks.
- [x] 3.3 Verify GC tests pass and confirm zero allocation (no iterators used).

## 4. cancel_pending Implementation

- [x] 4.1 Write failing tests for `cancel_pending` action correctly flushing `scheduledActions`, stopping active `TrackedPlaybacks`, and stopping tagged loops.
- [x] 4.2 Implement `cancel_pending` handling in `executeAction`: iterate over `scheduledActions` and remove matches (swap-and-pop).
- [x] 4.3 Extend `cancel_pending` handling: iterate over `trackedPlaybacks`, call `router.stop()` for matches, and remove them (swap-and-pop).
- [x] 4.4 Extend `cancel_pending` handling: stop active `Sequencer` loops that were started with matched tags.
- [x] 4.5 Verify all cancellation tests pass.

## 5. Verification & Linting

- [x] 5.1 Run full test suite (`npm run test`) and verify all passing.
- [x] 5.2 Run oxc linting (`npm run lint`) and clear any warnings.
- [x] 5.3 Run typecheck (`npm run typecheck`).
