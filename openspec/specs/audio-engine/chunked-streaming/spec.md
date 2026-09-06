# audio-engine/chunked-streaming Specification

## Purpose

Defines the requirements for the chunked buffer streaming pipeline to play long ambient audio assets with low RAM usage while maintaining full DSP capability.

## Requirements

### Requirement: Asset Pipeline Codec Constraints
The system MUST receive chunks that are sliced from a single continuously-encoded bitstream to prevent MDCT windowing ringing that offset trimming alone cannot resolve.

#### Scenario: Loading properly encoded chunks
- **GIVEN** a manifest with chunks sliced from a continuous bitstream
- **WHEN** the engine stitches them together
- **THEN** no MDCT ringing artifacts occur at the boundaries

### Requirement: Stream Manifest Consumption
The system MUST support consuming an audio stream manifest that defines an ordered sequence of audio fragments, their URLs, `trimStartSamples`, `durationSamples`, and an overall `isLooping` state.

#### Scenario: Valid manifest loading
- **GIVEN** a valid stream manifest specifying chunk URLs and precise sample lengths
- **WHEN** the engine receives the manifest for a new playback
- **THEN** it accepts the sound as valid and prepares the loader for the first chunk

### Requirement: Look-Ahead Chunk Buffering
The streaming system MUST fetch and decode upcoming chunks in advance. The fetch trigger MUST be evaluated via the engine's deterministic ticker, tolerating typical main-thread scheduling jitter within the configured margin. The trigger threshold MUST be defined mathematically as `max(50% of chunkDuration, absoluteFloorSeconds)` (e.g., a 2-second floor) to protect short chunks.

#### Scenario: Pre-loading next chunk deterministically
- **GIVEN** a chunked stream is currently playing
- **WHEN** the engine's ticker evaluates that the active chunk has crossed the `max(50%, absoluteFloor)` threshold
- **THEN** the system fetches and decodes the next consecutive chunk in the background without interrupting playback

### Requirement: Pause Orchestration, Suspend, & Cache Eviction Policy
The `StreamNode` MUST act as a Facade for both pausing and resuming; calling `StreamNode.pause()` or `StreamNode.resume()` MUST internally cascade to the `ChunkedLoader`. The Application layer MUST NOT manually orchestrate this. The `ChunkedLoader` MUST halt background fetching when paused or when the `AudioContext` is suspended. Pausing MUST preserve already-decoded chunks in the look-ahead queue to guarantee a gapless resume, BUT it MUST enforce a TTL (e.g., 5 minutes); if paused beyond the TTL, the queue MUST be flushed to release RAM. If the OS reclaims the hardware (`AudioContext.state === 'closed'`), OR if the context enters a "zombie" state (a watchdog heuristic detects `AudioContext.currentTime` failing to progress on resume despite a `running` state), the resume logic MUST fully re-initialize and re-fetch from the calculated offset rather than reusing a dead queue.

#### Scenario: Long pause triggering eviction
- **GIVEN** a stream is playing and fetching upcoming chunks
- **WHEN** the stream is paused for longer than the TTL threshold (e.g., 5 minutes)
- **THEN** the loader flushes the decoded queue to reclaim memory, requiring a re-fetch upon resume

### Requirement: Gapless Scheduling and Padding Bypass
The system MUST guarantee mathematically perfect gapless transitions by explicitly bypassing browser-injected decoder padding (e.g., priming samples) using `AudioBufferSourceNode.start(when, offset, duration)`.

#### Scenario: Transitioning between chunks
- **GIVEN** two consecutive audio chunks have been decoded
- **WHEN** the first chunk reaches its exact sample duration
- **THEN** the second chunk begins playback instantly at that exact time, utilizing precise offsets to bypass any padding, with zero micro-gaps or clicking artifacts

### Requirement: Ambient Looping
If the stream manifest defines `isLooping` as true, the loader MUST seamlessly wrap back to Chunk 0 upon reaching the final chunk.

#### Scenario: Looping a chunked stream
- **GIVEN** a chunked stream with `isLooping: true` is playing its final chunk
- **WHEN** the final chunk nears completion
- **THEN** the system queues Chunk 0 to play gaplessly immediately after the final chunk ends

### Requirement: Pause & Resume Mechanics (Composite Math)
The system MUST support pausing and resuming by recording the exact physical elapsed time on pause. Upon resume, it MUST recreate the active `AudioBufferSourceNode`s using a composite offset formula: `resumeOffset = trimStartSamples + logicalElapsedSincePauseWithinChunk`. Due to floating-point math, boundary checks MUST use an epsilon tolerance (`Math.abs(elapsed - duration) < EPSILON`). If a pause occurs exactly on the boundary sample between two chunks, the elapsed time MUST be assigned to the beginning of the new chunk.

#### Scenario: Pausing and resuming a stream near a boundary
- **GIVEN** a chunked stream is currently playing
- **WHEN** the stream is paused exactly at a chunk boundary (within EPSILON)
- **THEN** it resumes using the next chunk with its trimStartSamples offset, seamlessly recreating the necessary nodes

### Requirement: Strict Timeline during Deadline Underruns
If a chunk is not ready by its scheduled boundary regardless of the cause (e.g., network stall, decode latency, or main-thread GC block), the timeline MUST NOT shift. The engine MUST output silence and resume the next chunk at its strictly scheduled absolute time. If the underrun persists, fetch retries MUST utilize a backoff strategy, emitting an `audio_stream_underrun_fatal` telemetry event after a 3-fetch cap is reached. Crucially, calling `pause()` MUST explicitly cancel/freeze any in-flight underrun backoff timers to prevent false-positive telemetry, and calling `resume()` MUST explicitly reset the retry counter to `0`.

#### Scenario: Pausing during a network underrun
- **GIVEN** a chunked stream is experiencing an underrun and a backoff timer is ticking
- **WHEN** the user or application pauses the stream
- **THEN** the backoff timer is frozen/cancelled, preventing a false `audio_stream_underrun_fatal` event from firing

