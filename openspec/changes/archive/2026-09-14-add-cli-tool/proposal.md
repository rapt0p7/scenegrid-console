## Why

Web Audio `decodeAudioData` consumes massive amounts of RAM (uncompressed 32-bit floats), causing silent crashes on mobile when large assets are loaded. SceneGrid developers currently lack an automated AOT (Ahead-Of-Time) tooling pipeline to safely convert raw WAV files into memory-safe Codec Ladders (Opus/AAC/MP3) and chunked audio streams (`IStreamManifest`). An automated, 12-factor compliant CLI tool ensures precise PCM memory footprints are calculated before runtime, automates encoding based on engine quotas, and guarantees memory stability without burdening the core engine package.

## What Changes

- **NEW**: Introduce `@scenegrid/cli` as a standalone NPM workspace package (e.g., `packages/cli`) to guarantee that heavy Node dependencies (`commander`, `execa`, `music-metadata`, `zod`) never leak into the core engine runtime.
- **NEW**: Native, cross-platform chunking logic in Node/TypeScript using `execa` to call `ffmpeg` directly. This eliminates the reliance on brittle bash scripts (e.g., `scripts/generate_stream.sh`) and provides robust support for Windows developers.
- **NEW**: 12-Factor compliant configuration system. The CLI will accept configuration via CLI flags (`--input`, `--output`), environment variables, or a local `.scenegridrc` file, resolving paths safely with fallbacks to the Current Working Directory (CWD).
- **NEW**: AOT size heuristics. The CLI will calculate the exact PCM footprint for each input file. Assets exceeding the engine's 15MB RAM quota (roughly 42 seconds) are automatically routed to the Chunked Stream generator, while smaller assets generate a standard Codec Ladder (`ISoundMap`).
- **NEW**: Build-time consistency validation. The CLI will generate the `precalculatedSizes` dictionary, merge it with the engine payload, and run the `ConsistencyChecker` to fail the build if memory limits are breached.
- **REMOVED**: The Sprite Sheet Generator feature is dropped to maintain focus strictly on Codec Ladders and Chunked Streams, aligning with SceneGrid's architectural constraints for general UI sounds.

## Capabilities

### New Capabilities
- `cli-asset-pipeline`: The standalone `@scenegrid/cli` package that handles 12-factor configuration, AOT PCM footprint calculation, and cross-platform ffmpeg orchestration.

### Modified Capabilities
- (None)

## Impact

- **Workspace:** Introduces a new `packages/cli` workspace to the monorepo.
- **Tooling:** Deprecates/removes the brittle `scripts/generate_stream.sh` in favor of native TypeScript `execa` logic.
- **Architectural Layers Affected:** The change primarily affects the **Infrastructure/Tooling** layer. It will import types and the `ConsistencyChecker` from the **Domain** layer to validate the generated payloads.
- **Dependency Rule:** The dependency rule (inward to Domain) remains unbroken. The `@scenegrid/cli` package will depend on `@scenegrid/engine` (specifically its Domain ports and validation logic) during build time, but the engine runtime itself will remain entirely isolated and free of CLI-related Node dependencies.
