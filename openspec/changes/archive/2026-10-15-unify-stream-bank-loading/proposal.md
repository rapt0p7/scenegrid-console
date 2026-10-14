## Why

Currently, audio asset loading is split across two disparate pathways: in-memory PCM sounds are assigned to banks and loaded via `audio.banks.load(bankId)`, whereas streaming voices bypass the bank system entirely and require callers to know which sounds are streams and load them individually via `audio.streams.load(soundId)`. This dual-path approach causes operational friction:
1. Callers must manually orchestrate individual stream manifest loads during engine initialization or scene transitions.
2. Background music and ambient streams cannot be loaded via event-driven bank actions (`load_bank` in `AudioEventOrchestrator`).
3. Stream sounds declared in `soundMap` are erroneously flagged as orphan sounds by `BankSystemRule` unless strict validation is disabled.
4. Stream manifest URLs are fetched without the SSRF protections and host sanitization enforced for buffer assets in `AudioBufferLoader`.

Unifying stream sounds into the bank management system eliminates the public `audio.streams` surface, centralizes asset lifecycle management within `BankManagerAdapter`, and ensures uniform progress reporting and SSRF safety.

## What Changes

- **Assign Stream Sounds to Banks**: Stream sounds are declared in `IBankConfig.sounds` alongside plain buffer sounds.
- **Hybrid Stream Classification**: `BankManagerAdapter` classifies sounds as streaming if `isStream === true` in `ISpriteSoundManifest` or if their primary URL matches `/\.json($|\?)/`.
- **BankManager Manifest Management**: `BankManagerAdapter` takes over fetching, caching, and serving stream manifests (`IStreamManifest`), isolating them from `AudioBufferLoader` to prevent invalid decoding and RAM quota inflation.
- **SSRF URL Sanitization**: Stream manifest URLs are validated against SSRF vulnerabilities via `validateAudioUrl` before fetching.
- **Stream Lifecycle on Bank Unload**: Calling `audio.banks.unload(bankId)` stops active `StreamInstance` playbacks, flushes decoded chunk queues, and evicts stream manifests from memory.
- **Public API Simplification**: **BREAKING** Remove `audio.streams` (`load`, `unload`) from `IAudioEngine` and `AudioEngine`. All loading occurs through `audio.banks.load(bankId)`.

## Capabilities

### New Capabilities
- `audio-engine/bank-management`: Defines requirements for unified bank lifecycle orchestration, including sound classification (buffer vs. stream), concurrent loading, SSRF protection, quota segregation, and unified unload cascade.

### Modified Capabilities
- (None)

## Impact

- **Affected Architectural Layers**:
  - **Domain Layer**:
    - `ISpriteSoundManifest` in `packages/engine/src/Domain/Configuration/Ports/ISpriteSoundManifest.ts` is updated with an optional `isStream?: boolean` property.
    - `BankSystemRule` in `packages/engine/src/Domain/Validation/Rules/BankSystemRule.ts` now validly checks stream sounds assigned to banks.
    - `IBankManager` in `packages/engine/src/Domain/Shared/Ports/IBankManager.ts` retains pure port contracts; dependency rule (inward to Domain) remains strictly preserved.
  - **Infrastructure Layer**:
    - `BankManagerAdapter` in `packages/engine/src/Infrastructure/loader/BankManagerAdapter.ts` handles sound partitioning, SSRF validation, stream manifest JSON fetching/caching, progress aggregation, and `getStreamManifest(url)` resolution.
    - `AudioUrlValidator` in `packages/engine/src/Infrastructure/loader/AudioUrlValidator.ts` is reused to sanitize stream manifest URLs.
    - `SoundController` receives `manifestResolver` backed by `BankManagerAdapter`.
  - **Application Layer**:
    - `IAudioEngine` in `packages/engine/src/Application/Ports/IAudioEngine.ts` removes the `streams` getter.
    - `AudioEngine` in `packages/engine/src/Application/AudioEngine.ts` removes `#streamManifests` and `public get streams()`.
  - **Kernel & Inspector Layers**: Unaffected.
- **API Breaking Changes**:
  - Callers of `audio.streams.load()` and `audio.streams.unload()` must update to assign stream sounds to a bank and use `audio.banks.load(bankId)`.
  - `examples/main.ts` and `examples/audio-config/BankManifest.ts` updated to load `backgroundMain` via `audio.banks.load('music')`.
