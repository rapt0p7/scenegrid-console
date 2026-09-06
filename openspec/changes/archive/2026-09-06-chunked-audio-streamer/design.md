## Context

See proposal.md for motivation on why chunked streaming is necessary to bypass HTML5 `<audio>` constraints. The architecture demands that the streaming pipeline fits into the existing Web Audio DSP graph natively so that all routing, buses, VCAs, and limiters continue to work exactly as they do for fully-loaded tracks. 

## Goals / Non-Goals

**Goals:**
- Provide a `StreamManifest` format for declaring sequenced audio chunks with exact sample durations, offsets, and loop states.
- Create a loader that decodes fragments in the background while keeping memory low.
- Implement a gapless scheduler that queues up overlapping `AudioBufferSourceNode`s accurately on the Web Audio timeline, bypassing codec padding.

**Non-Goals:**
- Adaptive bitrate streaming (HLS/DASH) is out of scope; we assume a single continuous bitstream divided into chunks.
- Modifying the Domain layer to know about Web Audio specifics; streaming state logic stays confined to the Infrastructure layer, with a generic interface in Application/Domain.
- Using `StreamNode` for latency-sensitive SFX (UI clicks, impact sounds). It is EXCLUSIVELY designed for background/ambient tracks due to inherent look-ahead latency.

## Decisions

### 1. The `StreamNode` Flip-Flop Architecture & Codec Padding
**Decision:** We will build a `StreamNode` in the Infrastructure layer that wraps at least two `AudioBufferSourceNode`s. It will employ a "flip-flop" scheduling pattern (lifecycle overlap only, NOT signal crossfade/mixing) and explicitly use `AudioBufferSourceNode.start(when, offset, duration)`.
**Rationale:** "Overlapping" refers strictly to instantiating and scheduling Node B while Node A is actively playing; playback boundaries are strictly back-to-back. Calling `start` with explicit `offset` and `duration` bypasses browser-injected decoder padding (priming samples). However, this does not fix MDCT windowing ringing. Thus, we strictly mandate that the asset pipeline slices chunks from a single continuously-encoded bitstream.

### 2. Pause & Resume Mechanics (Composite Math)
**Decision:** On `pause()`, the `StreamNode` will record the exact physical elapsed time. On `resume()`, it will calculate the required inner-chunk `offset` using the composite formula: `resumeOffset = trimStartSamples + logicalElapsedSincePauseWithinChunk`. Boundary assignment uses `Math.abs(elapsed - duration) < EPSILON`.
**Rationale:** `AudioBufferSourceNode` does not support resuming once `stop()` is called. Tracking the absolute physical time ensures we can seamlessly reconstruct the flip-flop queue. Double-precision floating-point math makes strict equality (`===`) unsafe for boundary checks, necessitating the EPSILON tolerance.

### 3. Pause/Resume Orchestration & Encapsulation
**Decision:** The `StreamNode` is the single public entry point (Facade). Calling `StreamNode.pause()` or `StreamNode.resume()` MUST internally cascade to the `ChunkedLoader`. 
**Rationale:** The Application layer MUST NOT orchestrate the lifecycle between the Node and the Loader manually. Encapsulating this within the `StreamNode` guarantees atomicity and prevents out-of-sync states between playback and fetching.

### 4. Cache Eviction Policy & OS Context Death
**Decision:** When the `ChunkedLoader` is paused, it preserves the decoded queue up to a strict TTL (e.g., 5 minutes). If the TTL is exceeded, or if the OS reclaims hardware (`AudioContext.state === 'closed'`), or if a watchdog detects a "zombie" state (`state === 'running'` but `currentTime` fails to progress), the queue is flushed and must be re-fetched upon resume.
**Rationale:** Short pauses preserve the ready-state queue for gapless resumes. However, indefinitely holding decoded PCM contradicts our "near-zero RAM" goal. Furthermore, hardware reclamation (common in iOS Safari backgrounding during incoming calls or Siri) invalidates decoded buffers. Relying solely on `state === 'closed'` is unsafe because iOS often leaves the context in a "zombie" `running` state without advancing the hardware clock. The watchdog heuristic ensures a clean re-initialization rather than blindly reusing dead memory.

### 5. GC Pressure & Zero-Allocation Exceptions
**Decision:** Accept "macro-allocations" (allocating one large `Float32Array` via `decodeAudioData` every N seconds when a new chunk is fetched).
**Rationale:** While the engine enforces strict frame-by-frame zero-allocation constraints in the data plane, decoding compressed audio inherently requires buffer allocation. This macro-allocation happens infrequently in the background and is an acceptable trade-off for stream decoding.

### 6. The `ChunkedLoader` Look-Ahead Queue Trigger
**Decision:** The `ChunkedLoader` will maintain a configurable look-ahead queue (e.g., 2-3 chunks) fetching and decoding via `fetch()` and `AudioContext.decodeAudioData()`. The fetch trigger will evaluate via the engine's deterministic ticker using the formula `max(50% of chunkDuration, absoluteFloorSeconds)` (e.g., 2s floor).
**Rationale:** Using this margin math on a deterministic ticker tolerates typical main-thread scheduling jitter caused by heavy graphics and physics rendering, protecting short chunks and strictly prohibiting the use of `setTimeout` polling.

### 7. Manifest Definition
**Decision:** Define a new Port interface `IStreamManifest` (Application/Ports layer) that contains an array of `IStreamChunk` definitions, each with a URL, `trimStartSamples`, and exact `durationSamples`, along with an `isLooping` flag.
**Rationale:** Providing exact sample boundaries and trim offsets allows the scheduler to enforce strict timing and gapless boundaries regardless of codec padding.

## Risks / Trade-offs

- **[Risk] Deadline Underruns:** A chunk is not ready by its scheduled boundary regardless of the cause (network stall, decode latency, GC block).
  - **Mitigation:** The fallback logic MUST reside in the scheduling deadline path, not just a network error handler. The timeline MUST NOT shift. Fetch retries MUST use a backoff strategy. If the underrun persists beyond a 3-fetch retry cap, the system emits `audio_stream_underrun_fatal` telemetry. To prevent false-positives, `pause()` MUST explicitly cancel/freeze in-flight underrun backoff timers. Furthermore, `resume()` MUST cleanly reset the retry counter to `0`; because a pause can last minutes or hours, resuming a stale "2 of 3 attempts" counter risks immediate false telemetry.
- **[Risk] Application Pause & Context Suspension:** Continuing to fetch data when the app is paused or OS backgrounded drains battery/data.
  - **Mitigation:** Wire both `AudioContext` state change listeners and internal `StreamNode.pause()` cascades to halt look-ahead fetching, gracefully resuming on unlock/resume.
