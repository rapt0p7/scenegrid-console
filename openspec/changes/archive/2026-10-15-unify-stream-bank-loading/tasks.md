## 1. Domain Contracts & Manifest Types

- [x] 1.1 Update `ISpriteSoundManifest` in `packages/engine/src/Domain/Configuration/Ports/ISpriteSoundManifest.ts` to include optional `readonly isStream?: boolean` and verify typecheck passes (`npm run typecheck`).

## 2. BankManagerAdapter Stream Manifest Loading & SSRF Protection

- [x] 2.1 Write failing unit tests in `packages/engine/src/Infrastructure/loader/__tests__/BankManagerAdapter.test.ts` covering:
  - Hybrid stream detection (`isStream: true` and `.json` URL match).
  - Stream manifest fetching and caching via `BankManagerAdapter`.
  - Exclusion of stream sounds from `AudioBufferLoader.loadBatch` and RAM quota deduction.
  - SSRF URL validation with `validateAudioUrl` (blocking private/loopback IPs).
  - Aggregated progress reporting (`totalItems = buffers + streams`).
  - `getStreamManifest(url)` resolution.
  - Cascade stream stop and manifest eviction on `unloadBank()`.
- [x] 2.2 Implement hybrid stream detection and sound partitioning in `packages/engine/src/Infrastructure/loader/BankManagerAdapter.ts`.
- [x] 2.3 Implement stream manifest fetching with SSRF URL validation and caching in `BankManagerAdapter.ts`.
- [x] 2.4 Implement unified progress and error aggregation across buffer batch loads and stream manifest fetches in `BankManagerAdapter.ts`.
- [x] 2.5 Implement `getStreamManifest(url)` and update `unloadBank()` to stop active streams, delete cached manifests, and emit `onUnload` in `BankManagerAdapter.ts`.
- [x] 2.6 Run `npx vitest run packages/engine/src/Infrastructure/loader/__tests__/BankManagerAdapter.test.ts` and verify all tests pass.

## 3. AudioEngine Integration & Public API Cleanup

- [x] 3.1 Write failing unit tests in `packages/engine/src/Application/__tests__/AudioEngine.test.ts` asserting that `audio.banks.load()` loads stream manifests, that `manifestResolver` resolves via `BankManagerAdapter`, and that `audio.streams` is undefined.
- [x] 3.2 Remove `streams` interface definition from `IAudioEngine` in `packages/engine/src/Application/Ports/IAudioEngine.ts`.
- [x] 3.3 Remove `public get streams()` and `#streamManifests` map from `AudioEngine.ts` in `packages/engine/src/Application/AudioEngine.ts`, and delegate `manifestResolver` to `this.#bankManager.getStreamManifest(url)`.
- [x] 3.4 Migrate existing stream tests in `packages/engine/src/Application/__tests__/AudioEngine.test.ts` from `audio.streams.load()` to `audio.banks.load()`.
- [x] 3.5 Run `npx vitest run packages/engine/src/Application/__tests__/AudioEngine.test.ts` and verify all tests pass.

## 4. Examples, Documentation, and Project Verification

- [x] 4.1 Update `examples/audio-config/BankManifest.ts` to assign `backgroundMain` to the `music` bank.
- [x] 4.2 Update `examples/main.ts` to remove `await audio.streams.load('backgroundMain')` and test bank-based stream bootstrap.
- [x] 4.3 Update `README.md` and `packages/engine/README.md` to remove `audio.streams.load()` references and document unified bank loading.
- [x] 4.4 Run full workspace verification: `npm run lint`, `npm run typecheck`, and `npm run test` to verify zero regressions.
- [x] 4.5 Inspect code health on touched files using `repowise health` to ensure maintainability and complexity compliance.
