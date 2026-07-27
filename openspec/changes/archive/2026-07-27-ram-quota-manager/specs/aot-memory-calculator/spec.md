## ADDED Requirements

### Requirement: External AOT Size Calculation
External developer tooling SHALL determine the exact PCM memory footprint of audio assets for the consumer to inject.

#### Scenario: External tooling execution
- **WHEN** the developer runs the standalone CLI script or uses the optional bundler plugin
- **THEN** the tooling SHALL calculate the PCM byte size of physical audio files and generate a `Record<string, number>` mapping of URLs to sizes

### Requirement: Composition Root Injection
The host application SHALL be responsible for providing the precalculated sizes to the engine.

#### Scenario: Engine initialization
- **WHEN** the host application initializes the audio engine
- **THEN** it SHALL optionally pass the generated size dictionary via `IAudioEngineConfig.precalculatedSizes`
