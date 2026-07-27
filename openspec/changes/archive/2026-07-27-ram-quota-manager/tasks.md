## 1. Build Pipeline (External AOT Tooling)

- [x] 1.1 Create standalone developer tooling package/script for AOT size calculation.
- [x] 1.2 Implement logic to parse physical audio files and generate a `Record<string, number>` mapping of URL to expected PCM size (MB).
- [x] 1.3 Add test suite verifying extraction logic.

## 2. Domain & Application Layer Updates

- [x] 2.1 Modify `IAudioEngineConfig.ts` to include `precalculatedSizes?: Record<string, number>`.
- [x] 2.2 Modify `ISpriteSoundManifest.ts` to include `priority?: 'high' | 'low'`.
- [x] 2.3 Modify `IAudioBufferLoader.ts` to replace `url: string | string[]` with `AudioBufferRequest` DTO.
- [x] 2.4 Update `AudioEngine.ts` to pass `onEmergencyEviction` callback into `AudioBufferLoader`, wiring it to `TelemetryDispatcher`.
- [x] 2.5 Run typecheck and ensure no dependency rules are broken (no bundler imports in engine).

## 3. Core Infrastructure Refactoring (Zero-Allocation Arrays)

- [x] 3.1 Write unit tests for `AudioBufferLoader.ts` validating $O(1)$ Linked List Array operations (snip, pushToHead).
- [x] 3.2 Refactor `BankManagerAdapter.ts` to construct the new `AudioBufferRequest` DTO from the manifest, applying the `precalculatedSizes` dictionary or falling back to 5.0 MB with a warning.
- [x] 3.3 Initialize parallel primitive arrays inside `AudioBufferLoader` (`bufferPool`, `bufferSizes`, `priorities`, `next`, `prev`).
- [x] 3.4 Initialize $O(1)$ mapping structures (`urlToIndex` Map and `indexToUrl` array).
- [x] 3.5 Initialize zero-allocation LIFO free stack (`freeIndices`, `freeIndexHead`).

## 4. LRU Eviction Implementation

- [x] 4.1 Write integration tests asserting that Quota breaches trigger the correct semantic priority eviction and missing sizes fallback correctly.
- [x] 4.2 Implement `load(request)` to proactively validate `currentRamMb + request.expectedSizeMb > QUOTA` before fetch.
- [x] 4.3 Implement `evict(requiredMb)` algorithm to purge `#tailLow` first, gracefully falling back to `#tailHigh`.
- [x] 4.4 Update `getBuffer(url)` to resolve the index from `urlToIndex`, snip it, and push it to the head of its priority queue.
- [x] 4.5 Ensure `onEmergencyEviction` fires exactly when a high-priority buffer is popped.
- [x] 4.6 Run full test suite, verify memory footprints in Inspector, and clear all oxc/eslint warnings.
