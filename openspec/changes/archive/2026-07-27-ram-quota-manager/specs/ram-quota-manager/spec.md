## ADDED Requirements

### Requirement: Memory Budget Tracking
The engine SHALL maintain a deterministic record of all decoded PCM audio loaded into memory.

#### Scenario: Pre-fetch verification
- **WHEN** the `AudioBufferLoader` receives a request to load a sound
- **THEN** it SHALL verify if the `currentMemoryMb + expectedSizeMb` exceeds the global quota before invoking `decodeAudioData`

### Requirement: Zero-Allocation Eviction
The engine SHALL proactively evict unused `AudioBuffer` objects from the cache using a zero-allocation Linked List Array.

#### Scenario: Standard low-priority eviction
- **WHEN** the quota is exceeded by an incoming request
- **THEN** the engine SHALL evict the least recently used buffers marked with `priority: low` until enough space is reclaimed

#### Scenario: Emergency high-priority eviction
- **WHEN** all `low` priority buffers are purged and the quota is still exceeded
- **THEN** the engine SHALL evict the least recently used buffers marked with `priority: high` and trigger an `OOM_CRITICAL_EVICTION` telemetry event

### Requirement: Runtime Size Fallback
The engine SHALL gracefully handle audio assets that lack precalculated sizes.

#### Scenario: Missing precalculated size
- **WHEN** an audio asset is requested but is missing from the injected `precalculatedSizes` dictionary
- **THEN** the `BankManagerAdapter` SHALL fallback to a safe default of 5.0 MB and emit a console warning

### Requirement: Ghost Buffer Degradation
The engine SHALL permit silent drops for evicted buffers to maintain consistent framerates.

#### Scenario: Playing an evicted sound
- **WHEN** the `SoundController` attempts to play a sound whose buffer was evicted
- **THEN** it SHALL synchronously return `null` and drop the request without crashing or janking the game loop
