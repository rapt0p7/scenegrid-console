## 1. Manifest & Interfaces

- [x] 1.1 Define `IStreamManifest` and `IStreamChunk` interfaces in the Application layer, including `trimStartSamples`, `durationSamples`, and `isLooping`.
- [x] 1.2 Create a mock stream manifest fixture for testing and verify it is accessible to the test runner.

## 2. Loader Implementation

- [x] 2.1 Write a failing unit test for `ChunkedLoader` covering the look-ahead fetch queue, seamless wrap-around to Chunk 0, and the `max(50%, absoluteFloor)` margin math trigger.
- [x] 2.2 Write a failing unit test asserting fetching pauses during an application `pause()` command or `AudioContext` suspension, and asserts the TTL cache eviction, `state === 'closed'` re-fetch logic, and the iOS zombie watchdog heuristic (mocking stalled `currentTime`).
- [x] 2.3 Write a failing unit test for the 3-fetch retry cap utilizing a backoff strategy and emitting `audio_stream_underrun_fatal` telemetry, asserting that `pause()` freezes timers and `resume()` resets the retry counter to `0`.
- [x] 2.4 Implement `ChunkedLoader` logic (ticker margin math, suspend/pause listeners, TTL queue eviction, watchdog heuristic, and backoff retry caps) using `fetch` and `decodeAudioData` and verify tests pass.

## 3. Scheduler Implementation

- [x] 3.1 Write a failing unit test for `StreamNode` asserting gapless transitions using `start(when, offset, duration)` to bypass padding (verifying back-to-back bounds, not signal crossfade).
- [x] 3.2 Write a failing unit test asserting pause/resume recreates nodes using the composite offset formula (`resumeOffset = trimStartSamples + logicalElapsedSincePauseWithinChunk`), using epsilon math (`Math.abs(elapsed - duration) < EPSILON`) for chunk boundaries.
- [x] 3.3 Write a failing unit test ensuring that during a simulated Deadline Underrun (chunk not ready for any reason), the fallback logic triggers in the scheduling path: the timeline does not shift and chunks schedule at absolute times.
- [x] 3.4 Implement `StreamNode` flip-flop scheduling, pause/resume math, strict timeline enforcement, and Facade orchestration (cascading `pause()`/`resume()` to loader) in `packages/engine/src/Infrastructure/nodes/`.
- [x] 3.5 Verify all `StreamNode` unit tests pass.

## 4. Engine Integration

- [x] 4.1 Update `SoundController` to instantiate `StreamNode` when playing a chunked manifest, and verify it routes correctly into the `AudioRouter` without manual pause orchestration.
- [x] 4.2 Verify the DSP graph integration by creating a manual test example (in `examples/main.ts`) that plays a chunked stream through a VCA bus and tests pause/resume.
- [x] 4.3 Run `npm run typecheck` and `npm run lint` and verify all oxc warnings and type errors are cleared.
