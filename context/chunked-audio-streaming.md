# Chunked Audio Streaming

## The StreamNode Flip-Flop Architecture & Codec Padding

**Id:** b2096d38-e415-486c-8631-e22612afe05d
**Type:** decision
**Status:** active
**Evidence:** confirmed
**Source:** design.md (chunked-audio-streamer)

We wrap at least two `AudioBufferSourceNode`s in a "flip-flop" scheduling pattern (overlapping lifecycles, NOT signal crossfade) using `AudioBufferSourceNode.start(when, offset, duration)`.

**Reason:** Calling `start` with explicit `offset` and `duration` bypasses browser-injected decoder padding (priming samples) making gapless playback possible. However, this doesn't fix MDCT windowing ringing, which strictly mandates that the asset pipeline slices chunks from a single continuously-encoded bitstream.

**Rejected alternative:** Using a standard HTML5 `<audio>` element. Rejected because the streaming pipeline must fit into the existing Web Audio DSP graph natively so that all routing, buses, VCAs, and limiters continue to work exactly as they do for fully-loaded tracks.

## Pause & Resume Mechanics (Composite Math)

**Id:** 68db2236-b8de-4c00-b897-f2aabb3cca24
**Type:** decision
**Status:** active
**Evidence:** confirmed
**Source:** design.md (chunked-audio-streamer)

On `pause()`, the `StreamNode` records the exact physical elapsed time. On `resume()`, it calculates the required inner-chunk `offset` using the composite formula: `resumeOffset = trimStartSamples + logicalElapsedSincePauseWithinChunk`.

**Reason:** `AudioBufferSourceNode` does not support resuming once `stop()` is called. Tracking the absolute physical time ensures we can seamlessly reconstruct the flip-flop queue. Double-precision floating-point math makes strict equality (`===`) unsafe for boundary checks, necessitating the EPSILON tolerance.

## Cache Eviction Policy & OS Context Death

**Id:** dec9173e-732d-4714-bacb-edc28066ac74
**Type:** decision
**Status:** active
**Evidence:** confirmed
**Source:** design.md (chunked-audio-streamer)

When the `ChunkedLoader` is paused, it preserves the decoded queue up to a strict TTL (e.g., 5 minutes). If the TTL is exceeded, or if the OS reclaims hardware (`AudioContext.state === 'closed'`), or if a watchdog detects a "zombie" state (`state === 'running'` but `currentTime` fails to progress), the queue is flushed and must be re-fetched upon resume.

**Reason:** Short pauses preserve the ready-state queue for gapless resumes, but indefinitely holding decoded PCM contradicts our "near-zero RAM" goal. Furthermore, hardware reclamation (common in iOS Safari backgrounding) invalidates decoded buffers. Relying solely on `state === 'closed'` is unsafe because iOS often leaves the context in a "zombie" `running` state without advancing the hardware clock. The watchdog heuristic ensures a clean re-initialization rather than blindly reusing dead memory.

## GC Pressure & Zero-Allocation Exceptions

**Id:** 6c26540b-d512-43b9-99a2-527f7a2a3ce9
**Type:** decision
**Status:** active
**Evidence:** confirmed
**Source:** design.md (chunked-audio-streamer)

We accept "macro-allocations" (allocating one large `Float32Array` via `decodeAudioData` every N seconds when a new chunk is fetched).

**Reason:** While the engine enforces strict frame-by-frame zero-allocation constraints in the data plane (DOD), decoding compressed audio inherently requires buffer allocation. This macro-allocation happens infrequently in the background and is an acceptable trade-off for stream decoding.

## Strict Timeline during Deadline Underruns

**Id:** 3283b474-b188-4f64-bd3e-ed960fb1306d
**Type:** decision
**Status:** active
**Evidence:** confirmed
**Source:** design.md (chunked-audio-streamer)

If a chunk is not ready by its scheduled boundary (network stall, decode latency, GC block), the timeline MUST NOT shift. The engine outputs silence and resumes the next chunk at its strictly scheduled absolute time.

**Reason:** Shifting the timeline breaks sync with the rest of the engine's sequencer and scheduling layer.

**Rejected alternative:** Shifting the timeline to wait for the chunk. Rejected because it would desync the background track from all other interactive elements on the AudioContext timeline.
