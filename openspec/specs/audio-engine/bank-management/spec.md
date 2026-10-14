# audio-engine/bank-management Specification

## Purpose

Coordinates unified audio bank lifecycles, orchestrating the loading and unloading of both in-memory PCM buffers and chunked stream manifests with SSRF validation, memory quota protection, and atomic state transitions.

## Requirements

### Requirement: Unified Bank Asset Loading
The system SHALL load all sounds declared within a bank through `loadBank(bankId)`, partitioning sound definitions into decoded buffer assets and stream manifest assets while presenting a single asynchronous completion boundary.

#### Scenario: Loading a bank with mixed buffer and stream sounds
- **GIVEN** a bank configuration containing both buffer sound IDs and stream sound IDs
- **WHEN** `loadBank(bankId)` is invoked
- **THEN** buffer sounds are batch-loaded into the audio buffer cache, stream manifests are fetched as JSON into the stream manifest cache, and the bank transitions to `LOADED`

#### Scenario: Loading a bank with stream-only sounds
- **GIVEN** a bank configuration containing exclusively stream sound IDs
- **WHEN** `loadBank(bankId)` is invoked
- **THEN** all stream manifests are fetched and cached, no audio buffers are decoded, and the bank transitions to `LOADED`

### Requirement: Hybrid Stream Asset Classification
The system MUST classify a sound definition as a streaming voice if the sound manifest explicitly sets `isStream: true` OR if the primary URL ends with `.json`.

#### Scenario: Explicit stream flag classification
- **GIVEN** a sound definition in the manifest with `isStream: true` and a URL not ending with `.json`
- **WHEN** the bank containing the sound is loaded
- **THEN** the system classifies and processes the sound as a stream manifest asset

#### Scenario: Extension-based stream classification
- **GIVEN** a sound definition with a URL ending in `.json` and no explicit `isStream` flag
- **WHEN** the bank containing the sound is loaded
- **THEN** the system classifies and processes the sound as a stream manifest asset

### Requirement: Server-Side Request Forgery (SSRF) Protection on Manifests
The system MUST validate all stream manifest URLs against SSRF vulnerabilities before initiating network fetches, blocking private network subnets (RFC 1918), loopback addresses (unless explicitly enabled), cloud metadata endpoints (`169.254.169.254`), and unauthorized protocols.

#### Scenario: Blocked unsafe manifest URL
- **GIVEN** a stream sound pointing to a blocked IP address or cloud metadata endpoint
- **WHEN** `loadBank(bankId)` processes the stream manifest
- **THEN** the network request is blocked, an error event is dispatched, and the bank transitions to `ERROR`

### Requirement: Buffer Quota Segregation for Stream Manifests
Stream manifest JSON payloads MUST NOT be dispatched to `AudioBufferLoader` and MUST NOT deduct from the audio buffer RAM eviction quota (`expectedSizeMb`).

#### Scenario: Preserving buffer RAM quota during stream bank loading
- **GIVEN** an audio bank containing streaming audio sounds
- **WHEN** the bank is loaded
- **THEN** zero bytes are deducted from the buffer loader RAM quota for stream sounds

### Requirement: Unified Progress and Error Telemetry
The system MUST aggregate progress across both buffer decodes and stream manifest downloads, emitting `onStart`, `onProgress`, `onError`, and `onComplete` events reflecting the combined total items.

#### Scenario: Combined item progress reporting
- **GIVEN** a bank containing 3 buffer sounds and 2 stream sounds
- **WHEN** `loadBank(bankId)` executes
- **THEN** `onStart` is emitted with `totalItems = 5`, and `onProgress` fires as each buffer or stream manifest completes

#### Scenario: Reporting failure of a stream manifest load
- **GIVEN** a bank containing a stream sound whose manifest returns HTTP 404 or invalid JSON
- **WHEN** `loadBank(bankId)` executes
- **THEN** `onError` is fired with the failing sound ID, the bank state transitions to `ERROR`, and `loadBank` returns an `Err` result

### Requirement: Stream Playback and Manifest Resolution
The sound controller MUST query the bank manager for loaded stream manifests when playing a stream-backed sound, and refuse playback if the owning bank has not been loaded.

#### Scenario: Playing a loaded stream sound
- **GIVEN** a bank containing stream sound `bgm` is in `LOADED` state
- **WHEN** `audio.play('bgm')` is invoked
- **THEN** the sound controller retrieves the cached stream manifest and instantiates a `StreamInstance`

#### Scenario: Refusing playback of an unloaded stream sound
- **GIVEN** a bank containing stream sound `bgm` is in `UNLOADED` state
- **WHEN** `audio.play('bgm')` is invoked
- **THEN** the sound controller receives `undefined` for the stream manifest and returns `null` for the playback ID

### Requirement: Bank Unload Cascade for Streams
When `unloadBank(bankId)` is called, the system MUST stop all active stream playbacks for sounds in that bank without tail, halt look-ahead chunk fetching, and evict their stream manifests from memory.

#### Scenario: Clean stream termination on bank unload
- **GIVEN** a stream sound from bank `music` is actively playing
- **WHEN** `unloadBank('music')` is invoked
- **THEN** active playback of the stream is stopped immediately, the stream instance and its ticker tasks are disposed, and the stream manifest is deleted from cache
