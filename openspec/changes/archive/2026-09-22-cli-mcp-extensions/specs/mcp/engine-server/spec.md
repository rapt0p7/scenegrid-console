## ADDED Requirements

### Requirement: AOT Asset Processing Tool
The MCP Server SHALL provide a tool to execute the CLI asset processing pipeline programmatically.

#### Scenario: Agent requests full asset processing
- **WHEN** the agent calls `process_assets` with valid pipeline options (inputDir, outputDir, manifestsDir, quotaMb, streamRules, streamExclusions)
- **THEN** the MCP server executes the `@scene-grid/cli` pipeline and generates the audio assets and manifests

### Requirement: SoundId Alias Generation Tool
The MCP Server SHALL provide a tool to scan directories and generate SoundId aliases.

#### Scenario: Agent requests alias generation
- **WHEN** the agent calls `generate_aliases` with an input directory and output file
- **THEN** the MCP server executes the `@scene-grid/cli` alias generator to map file names to typed SoundIds

### Requirement: PCM Memory Weight Inspection Tool
The MCP Server SHALL provide a tool to inspect the uncompressed memory footprint of raw audio files.

#### Scenario: Agent inspects a raw audio file
- **WHEN** the agent calls `inspect_pcm_weight` for a specific file path
- **THEN** the MCP server reads the file header and returns the duration, channels, sample rate, and exact PCM size in bytes

### Requirement: Quota Preview Tool
The MCP Server SHALL provide a tool to generate a dry-run memory allocation preview.

#### Scenario: Agent requests quota preview
- **WHEN** the agent calls the `get_quota_preview` tool with an input directory, RAM quota, and streaming rules
- **THEN** the server returns a dry-run report detailing which assets will be loaded into memory and which will be streamed, based on the provided inputs
