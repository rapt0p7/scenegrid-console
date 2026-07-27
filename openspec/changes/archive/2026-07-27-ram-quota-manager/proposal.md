## Why

Mobile web browsers (particularly iOS Safari) are extremely aggressive at killing tabs that experience memory spikes. In a high-fidelity Web Audio game, keeping all loaded `AudioBuffer` objects in memory indefinitely causes runaway RAM usage. The current `AudioBufferLoader` uses an unbounded `Map<string, AudioBuffer>`, making OOM (Out-Of-Memory) crashes inevitable on long play sessions on low-end devices. This change introduces strict tracking and eviction to provide absolute protection against OOM crashes while keeping the engine build-tool agnostic.

## What Changes

- Implement a strict memory budget tracking system for decoded PCM AudioBuffers.
- Replace the unbounded Map cache in `AudioBufferLoader` with a fixed-capacity, zero-allocation LRU cache.
- Introduce semantic priority locking (`high` vs `low`) to protect critical audio cues during eviction.
- Implement proactive $O(1)$ eviction that drops old `low` priority sounds before fetching new ones if the quota is exceeded.
- Emit critical telemetry warnings when emergency eviction drops a `high` priority sound.
- Inject `precalculatedSizes` via `IAudioEngineConfig` (Composition Root) to maintain framework agnosticism, falling back to 5.0MB defaults when missing.

## Capabilities

### New Capabilities
- `ram-quota-manager`: Manages memory limits by tracking expected PCM sizes and proactively evicting old buffers using a zero-allocation LRU.
- `aot-memory-calculator`: External developer tooling (standalone script/optional Vite plugin) to calculate expected PCM sizes of audio assets ahead-of-time for consumer injection.

### Modified Capabilities
- None

## Impact

- **Infrastructure Layer**: Extensive changes to `AudioBufferLoader` to implement zero-allocation cache arrays. `BankManagerAdapter` updated to inject DTO requests with size fallbacks.
- **Application Layer**: `IAudioEngineConfig` expands to accept `precalculatedSizes`. `AudioEngine` composition root updated to inject telemetry callback into the loader.
- **Domain/Configuration Layer**: `ISpriteSoundManifest` schema expands to include `priority`.
- **Dependency Rule**: Remains strictly unbroken. The runtime engine does not import virtual modules. The AOT tooling is fully externalized.
