# @scene-grid/shared

> Foundation types, telemetry transport, and mathematical utilities for SceneGrid

[![npm version](https://badge.fury.io/js/@scene-grid%2Fshared.svg)](https://badge.fury.io/js/@scene-grid%2Fshared)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`@scene-grid/shared` is the absolute foundation of the SceneGrid ecosystem. It enforces strict vocabulary, domain types, and mathematical consistency across the entire platform, guaranteeing that the engine, CLI, Inspector UI, and external AI agents speak the exact same language.

## Installation

```bash
npm install @scene-grid/shared
```

## Architecture & Data Flow

Because this is a library of shared utilities, it has no standalone execution flow. Instead, it provides the critical inputs and outputs used by all other packages:

1. **Strict Branded Types**: Exposes utility types (e.g., `SoundId`, `BusId`, `EventId`) that prevent primitive string interchangeability. This ensures a `SoundId` cannot accidentally be passed into a function expecting a `BusId`, preventing category errors at compile time.
2. **Telemetry Bridges**: Defines the exact TypeScript interfaces and constants required for the engine to broadcast JSON payloads to the Inspector or MCP server without duplicating data structures.
3. **Mathematical Evaluators**: Provides deterministic curve evaluations (Linear, Logarithmic, S-Curve, Exponential). By keeping these functions in the shared package, both the `engine` (when processing DSP) and the `inspector` (when rendering UI visualizations) generate the exact same mathematical trajectory for a given parameter change, ensuring visual parity with audible results.

## Constraints & Limitations

* **Zero Dependencies**: To guarantee absolute portability across vastly different environments, this package heavily restricts external dependencies.
* **Environment Agnostic**: Code in this package is strictly isomorphic TypeScript/JavaScript. It must never reference environment-specific globals like `window`, `document`, or `process`.
* **Side-Effect Free**: All math evaluators and data transformers are pure functions.

## License
MIT © Igor Zabrodin
