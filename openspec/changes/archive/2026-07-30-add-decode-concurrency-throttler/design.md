# Design: Decode Concurrency Throttler

## Architecture
The throttler will be implemented as a zero-allocation circular queue (similar in spirit to `CyclePool`). It limits how many promises can be active at once, storing pending resolve functions in a fixed-size ring buffer array to avoid `Array.shift()` and `Array.push()` memory churn.

## Components

### `ConcurrencyThrottler<T>`
- **Location**: `packages/shared/src/Memory/ConcurrencyThrottler.ts`
- **Details**: Uses `head` and `tail` pointers on a fixed pre-allocated array based on a power-of-two size mask.
- **Method**: `enqueue<T>(task: () => Promise<T>): Promise<T>` - waits if active operations hit the limit, triggering the next task from the queue once one completes.

### `AudioEngine` Configuration
- Update `AudioEngine` initialization configuration type to accept `decodeConcurrencyLimit` and `maxQueueSize`.

### `AudioBufferLoader` Integration
- **Location**: `packages/engine/src/Infrastructure/loader/AudioBufferLoader.ts`
- Receives the `ConcurrencyThrottler` instance (or limit config) from its constructor or context.
- Wraps the async logic in `loadBatch` utilizing the throttler.

## Alternative Considered
- **Throttling only the decode phase**: Rejected because leaving `fetch` unthrottled would lead to dozens of loaded `ArrayBuffer` items sitting in memory waiting for decode slots, causing unacceptable memory spikes on low-end hardware.
