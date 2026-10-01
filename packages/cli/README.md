# @scene-grid/cli

> Command-line asset pipeline and AOT audio processing for SceneGrid

[![npm version](https://badge.fury.io/js/@scene-grid%2Fcli.svg)](https://badge.fury.io/js/@scene-grid%2Fcli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`@scene-grid/cli` bridges the gap between raw audio authoring and the strict runtime requirements of the SceneGrid engine. It serves as an automated, Ahead-Of-Time (AOT) pipeline that manages memory quotas, routes assets into streaming or preloaded buckets, and generates strict aliases for runtime type safety.

## Installation

```bash
npm install -g @scene-grid/cli
# or install locally in your project
npm install -D @scene-grid/cli
```

## Quick Start

You can run the asset pipeline by simply invoking the `scenegrid` command. It accepts CLI flags, or reads from a `.scenegridrc` file (or a `scenegrid` block in your `package.json`):

```bash
# Process raw audio assets and chunk them based on strict memory rules
scenegrid --input ./raw-assets --output ./assets --manifests ./configs --quotaMb 15

# Generate initial alias mappings for your audio files
scenegrid init-aliases --input ./raw-assets --output ./aliases.json
```

## How It Works

Because web browsers have strict limitations on RAM usage, loading massive uncompressed audio buffers dynamically at runtime can cause Out-Of-Memory (OOM) crashes. The CLI executes the following deterministic data flow:

1. **Intake & Analysis**: Scans directories of raw audio files. It invokes `ffprobe` to inspect their binary headers and calculate their exact uncompressed RAM footprints (PCM weight).
2. **Quota Resolution**: Feeds these footprints into the Quota Manager. Based on your `--quotaMb` threshold and `--streamRules` (regex patterns), it determines which files are small enough to be pre-loaded into memory and which must be streamed.
3. **Processing**: Generates the final output structures, handling asset hashing (if `--hash` is enabled) and outputting optimized paths.
4. **Code Generation**: Emits `.json` manifest configurations guaranteed to be ready for the engine's consistency checker.

## Configuration Options

You can configure the CLI via cosmiconfig (`.scenegridrc`, etc) or via flags:
* `--input <path>`: Directory containing raw audio.
* `--output <path>`: Output directory for processed assets.
* `--manifests <path>`: Output directory for JSON manifests.
* `--baseUrl <url>`: Base URL prefix used in generated manifests.
* `--quotaMb <number>`: RAM quota (in MB) before triggering stream chunking (default: 15).
* `--streamRules <regexes...>`: Patterns to force streaming routing regardless of size.
* `--hash`: Append MD5 hash to generated file names.

## Constraints & Requirements

* **Node.js Environment**: The CLI requires Node.js and relies heavily on native APIs. It strictly cannot be run inside a web browser.
* **FFmpeg/FFprobe Requirement**: The CLI heavily relies on `ffprobe` to parse audio durations, channels, and sample rates. **You must have FFmpeg installed on your system PATH**.
* **AOT Execution**: Designed exclusively for Ahead-Of-Time execution during your CI/CD pipeline or build step. It does not dynamically process live audio.

## License
MIT © Igor Zabrodin
