# Proposal: Decode Concurrency Throttler

## Summary
Implement a zero-allocation task queue that limits simultaneous `decodeAudioData` requests (and fetches) to prevent main thread freezing during heavy asset bulk-loading.

## Motivation
Currently, `AudioBufferLoader` fires all network requests and decode operations at once during a `loadBatch` call. On low-end devices, or with massive sound banks, holding numerous raw `ArrayBuffer` objects simultaneously and rapidly pushing them into `decodeAudioData` causes extreme memory spikes, GC pauses, and main thread jank, which is unacceptable for an enterprise-grade solution.

## Scope
- Implement a GC-safe `ConcurrencyThrottler` using a ring buffer.
- Integrate it into `AudioBufferLoader.ts` to limit concurrent `fetch` and `decodeAudioData` operations.
- Make the concurrency limit configurable via `AudioEngine` init section.

## Out of Scope
- Modifying other resource loading (textures, etc.) not related to audio.
