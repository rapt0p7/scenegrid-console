## 1. Workspace Setup & Scaffolding

- [x] 1.1 Create `packages/cli` workspace structure, configure `package.json` and `tsconfig.json`, and verify `npm run build` succeeds with a dummy entry point
- [x] 1.2 Add dependencies (`commander`, `cosmiconfig`, `zod`, `execa`) to the CLI package and verify package installation succeeds
- [x] 1.3 Set up test environment and write a failing placeholder test to verify the test runner executes correctly in the new workspace

## 2. Configuration Logic (12-Factor)

- [x] 2.1 Write unit tests asserting that CLI flags take precedence over `.scenegridrc` configuration files
- [x] 2.2 Implement configuration parsing using `cosmiconfig` and `commander`, and verify that configuration merging tests pass
- [x] 2.3 Implement the `zod` validation schema to strictly type the merged configuration object, and verify it throws expected errors on invalid inputs

## 3. Metadata Extraction & PCM Calculation

- [x] 3.1 Write unit tests verifying that the PCM footprint calculation correctly applies the ~352.8 KB/sec formula for stereo 32-bit float 44.1kHz audio
- [x] 3.2 Implement `ffprobe` metadata extraction via `execa` to determine the exact duration and channel count of a source WAV file
- [x] 3.3 Implement the PCM footprint calculator utilizing the extracted metadata and verify calculation unit tests pass

## 4. Ffmpeg Orchestration & Routing

- [x] 4.1 Write routing unit tests asserting that assets > 15MB hit the chunking path and assets <= 15MB hit the ladder path
- [x] 4.2 Implement the Codec Ladder generator (using `execa` and `p-limit` for parallel `ffmpeg` Opus/AAC/MP3 encodes) and verify it generates expected files
- [x] 4.3 Implement the Chunked Stream generator (natively replacing `generate_stream.sh` via `execa`), outputting Ogg Vorbis chunks and verifying precise sample trimming logic
- [x] 4.4 Verify full `ffmpeg` pipeline execution by passing a dummy WAV file and inspecting the output directory

## 5. Artifact Assembly & Domain Validation

- [x] 5.1 Implement the generation of discrete JSON files (`audio-sizes.json`, `sound-map.json`, `stream-manifest.json`) and verify their shapes match the engine interfaces
- [x] 5.2 Import and run the `@domain/Validation/ConsistencyChecker` against the pre-flight configurations and verify it correctly catches RAM quota breaches
- [x] 5.3 Run an end-to-end test validating the complete pipeline from a raw directory to discrete final JSON artifacts
- [x] 5.4 Run the `oxc` linter across the `packages/cli` workspace and clear any resulting warnings

## 6. Iterative Feature Additions

- [x] 6.1 Implement MD5 hashing logic and `--hash` flag to append cache-busting suffixes to assets
- [x] 6.2 Implement `--streamRules` and `--streamExclusions` to override default size-based stream routing
- [x] 6.3 Fix static analysis tracing by swapping static engine imports for dynamic `await import()` in the validation pipeline
- [x] 6.4 Implement `--aliases` parsing to map generated payload manifests from physical filenames to logical `SoundId`s
- [x] 6.5 Add `init-aliases` command to auto-generate a boilerplate alias mapping file from an input directory
