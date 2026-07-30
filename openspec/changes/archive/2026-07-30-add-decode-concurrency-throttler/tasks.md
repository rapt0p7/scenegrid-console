# Tasks: Decode Concurrency Throttler

- [x] Create `packages/shared/src/Memory/ConcurrencyThrottler.ts` implementing the ring buffer based throttler.
- [x] Export `ConcurrencyThrottler` from `packages/shared/src/index.ts`.
- [x] Update `AudioEngine` configuration types and init function to accept `decodeConcurrencyLimit` and `maxQueueSize`.
- [x] Update `AudioBufferLoader` constructor to receive the limit config, and instantiate `ConcurrencyThrottler`.
- [x] Wrap the `performLoad` (or the inner map of `loadBatch`) inside `AudioBufferLoader.ts` with `throttler.enqueue()`.
- [x] Verify that `AudioBufferLoader` correctly passes along success and failure progress events under throttled conditions.
