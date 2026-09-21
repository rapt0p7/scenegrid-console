## Context

Web Audio asset preparation is a significant bottleneck. Developers need a way to build Codec Ladders and Chunked Streams seamlessly. See proposal.md for motivation - the tool must run as a standalone `@scene-grid/cli` workspace to keep the core engine runtime clear of heavy dependencies like `execa`, `commander`, and `zod`.

## Goals / Non-Goals

**Goals:**
- Provide a robust, cross-platform CLI tool using modern Node.js ecosystem packages.
- Define a clear configuration resolution pipeline that supports 12-factor principles.
- Safely encapsulate all `ffmpeg` binary executions, removing the reliance on bash scripts.
- Output artifacts that map directly to the engine's expected domain configuration interfaces.

**Non-Goals:**
- Generation of audio sprite sheets.
- Downloading or installing `ffmpeg` automatically (assumes `ffmpeg` is available in PATH or via an environment variable).

## Decisions

### 1. Configuration Parsing
**Decision:** Use `cosmiconfig` to load `.scenegridrc`, use `commander` for CLI flag parsing, and use `zod` to validate and merge the final configuration object.
**Rationale:** This stack cleanly separates concerns. `cosmiconfig` handles up-tree traversal for configuration files, `commander` handles CLI UX, and `zod` guarantees strict type-safety before any heavy processing begins.
**Alternatives:** Manual JSON parsing (`fs.readFileSync`) was rejected because it doesn't gracefully handle multiple config formats (e.g. YAML, JSON) or environment variable merging.

### 2. Output Artifact Shape (Discrete Engine-Compatible Files)
**Decision:** The CLI will output discrete JSON files that map 1:1 to the engine's current architecture, such as `audio-sizes.json`, `sound-map.json`, and `stream-manifest.json`.
**Rationale:** The golden rule is zero refactoring for the host application. The engine expects discrete configuration modules (e.g., `import AudioSizes from './audio-sizes.json'`). Outputting discrete artifacts ensures the CLI pipeline drops seamlessly into existing SceneGrid projects without breaking changes or engine configuration rewrites.
**Alternatives:** Outputting a unified `assets.json` payload was rejected because it would force existing host applications to refactor their initialization code and map nested properties manually.

### 3. Ffmpeg Process Orchestration
**Decision:** Re-implement `generate_stream.sh` chunking logic using `execa` and `ffprobe` for metadata extraction. Use a concurrency limiter (like `p-limit`) to execute `ffmpeg` processes for the Codec Ladder in parallel.
**Rationale:** Native `execa` calls provide absolute control over `stdout`/`stderr` parsing, allowing the CLI to show clean progress bars and gracefully fail. Hardcoded bash scripts break frequently on Windows machines without WSL.
**Alternatives:** Using `fluent-ffmpeg` was considered, but it introduces a heavy, often outdated wrapper. Direct `execa` calls to `ffmpeg -i input.wav ...` are more transparent and performant.

### 4. Strict Alias Mapping Inside CLI
**Decision:** Handle mapping of logical `SoundId`s to physical files completely inside the CLI via `--aliases`, and provide an `init-aliases` command to scaffold the mapping file.
**Rationale:** Preserves the engine's architectural assumptions. Modifying the engine's core `ISoundConfig` or `RamQuotaRule` to intercept physical filenames violated strict separation constraints. The CLI must mold its output to fit the engine, not the other way around.

### 5. Dynamic Engine Imports
**Decision:** Use dynamic `await import('@scene-grid/engine')` for runtime validation.
**Rationale:** Prevents `vite-plugin-dts` from statically tracing the CLI build into the `@scene-grid/engine` workspace and failing the build due to `rootDir` conflicts.

### 6. Stripping Video Streams
**Decision:** Append `-vn` to all FFmpeg commands.
**Rationale:** MP3 files embedding cover art are parsed by FFmpeg as video streams, causing catastrophic muxing errors when converting to formats like `m4a`.

## Risks / Trade-offs

- **[Risk] User does not have `ffmpeg` installed locally.**
  → **Mitigation:** The CLI will run a quick `execa('ffmpeg', ['-version'])` check on startup and throw a highly actionable, developer-friendly error if the binary is missing.
- **[Risk] High CPU/RAM consumption during concurrent encoding.**
  → **Mitigation:** We will default the concurrency limit to `Math.max(1, os.cpus().length - 1)` to prevent locking up the developer's machine during a large build.
