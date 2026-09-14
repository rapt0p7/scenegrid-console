# cli-asset-pipeline Specification

## Purpose
A standalone CLI tool to automate the Ahead-Of-Time (AOT) conversion of raw audio assets into memory-safe Codec Ladders and Chunked Streams, whilst calculating exact PCM footprints to prevent runtime memory crashes.

## Requirements

### Requirement: CLI Configuration Merging
The CLI SHALL merge configuration from .scenegridrc, environment variables, and CLI flags, adhering to 12-factor principles.

#### Scenario: Configuration Resolution Priority
- **WHEN** an input/output configuration option is provided via both CLI flag (e.g. --input) and in .scenegridrc
- **THEN** the CLI flag MUST take precedence over the .scenegridrc configuration

### Requirement: AOT PCM Footprint Calculation
The CLI SHALL calculate the exact PCM size (in MB) for each input audio asset based on its duration and channel count, assuming standard 32-bit float Web Audio precision.

#### Scenario: PCM Size Calculation
- **WHEN** the CLI parses a stereo 44.1kHz source audio file
- **THEN** it SHALL calculate the footprint based on a rate of ~352.8 KB per second of duration

### Requirement: Hybrid Streaming Routing (Size Threshold)
The CLI SHALL route assets with a PCM footprint > 15MB to the Chunked Stream generator.

#### Scenario: Large Asset Chunking
- **WHEN** an asset's calculated PCM size is > 15MB
- **THEN** the CLI SHALL generate Ogg Vorbis chunks and an IStreamManifest configuration block

### Requirement: Standard Codec Ladder Generation
The CLI SHALL route assets with a PCM footprint <= 15MB to the Codec Ladder generator.

#### Scenario: Small Asset Laddering
- **WHEN** an asset's calculated PCM size is <= 15MB
- **THEN** the CLI SHALL generate Opus, AAC, and MP3 files and an ISoundMap configuration block

### Requirement: Discrete Configuration Files Generation
The CLI SHALL output discrete configuration files that map 1:1 to the engine's current architecture, avoiding any refactoring burden on the host application.

#### Scenario: Successful Pipeline Execution
- **WHEN** the CLI successfully processes a directory of audio files
- **THEN** it SHALL write standalone JSON configuration files including udio-sizes.json for precalculatedSizes, sound-map.json for the Codec Ladders, and stream-manifest.json for Chunked Streams

### Requirement: Manifest Key Aliasing
The CLI SHALL support mapping physical asset basenames to logical engine SoundIds via an --aliases JSON mapping file.

#### Scenario: Aliased Output Generation
- **WHEN** a valid aliases mapping is provided and maps a basename to one or more placeholders
- **THEN** the output sound-manifest.json MUST use those placeholders as keys instead of the physical basename

### Requirement: Cache Busting via Hashing
The CLI SHALL optionally generate MD5 hashes of original input files and append them to output artifacts via a --hash flag.

### Requirement: Regex Routing Overrides
The CLI SHALL allow explicit forcing or exclusion of specific files from chunked stream routing via --streamRules and --streamExclusions regex arrays, overriding the standard PCM size threshold.

### Requirement: Stream Priority Control
The CLI SHALL support assigning a configured playback priority via a --streamPriority flag.
