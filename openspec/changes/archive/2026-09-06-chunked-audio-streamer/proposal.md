## Why

We need to support long ambient tracks (e.g., 3-minute clips) with near-zero RAM footprint without sacrificing engine features. While HTML5 `<audio>` and `MediaElementAudioSourceNode` seemed ideal, physical browser limitations (Event Loop jitter, micro-gaps, CORS silence, and Autoplay policies) prevent sample-accurate scheduling, gapless looping, and reliable playback. To resolve this, we will implement a "Chunked Buffer Streamer" that fetches and decodes audio fragments sequentially, scheduling them via overlapping `AudioBufferSourceNode`s. This keeps RAM low while preserving perfect Web Audio API timing and DSP graph compatibility.

## What Changes

- Introduce a chunked audio manifest format to define fragment URLs, exact `durationSamples`, `trimStartSamples` (to handle codec padding), and an `isLooping` state.
- Create a `ChunkedLoader` (Infrastructure layer) to manage look-ahead fetching, decoding, and queuing of audio chunks.
- Implement a `StreamNode` (Infrastructure layer) that orchestrates multiple `AudioBufferSourceNode`s to seamlessly schedule overlapping chunks for mathematically gapless playback.
- Define pause/resume mechanics that track exact physical elapsed time on pause to recreate nodes with precise inner-chunk offsets on resume.
- Expose the streaming feature through the Application layer without breaking the Domain layer's isolation.
- Ensure the resulting node correctly integrates into the `AudioRouter` and `AudioBusSystem` for VCA/limiter processing.

## Capabilities

### New Capabilities
- `audio-engine/chunked-streaming`: Defines the requirements for the chunked buffer streaming pipeline, including manifest structure, look-ahead buffering, gapless scheduling, looping, pause/resume, and DSP integration.

### Modified Capabilities
- (None)

## Impact

- **Infrastructure Layer:** Introduces `ChunkedLoader` and `StreamNode` in `packages/engine/src/Infrastructure/`.
- **Application Layer:** Extends the audio loading and playback interfaces to support stream manifests.
- **Domain Layer:** Unaffected. Dependency rule remains unbroken (inward only).
- **RAM Footprint:** Drastically reduced for large assets.
- **Network / Latency:** Relies on robust look-ahead fetching; timeline is strictly maintained even during network underruns.
