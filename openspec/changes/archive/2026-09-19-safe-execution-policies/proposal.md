## Why

Web Audio API failures (e.g., Autoplay Policy blocking `resume()`, `decodeAudioData` throwing on a corrupted stream) currently throw native exceptions that bubble up and crash the main game render loop if unhandled. Furthermore, internal hot paths (Ticker, Automation, Routing) swallow exceptions via `try/catch`, which masks mathematical timing bugs and severely deoptimizes the V8 JIT compiler. We need a comprehensive shift to a Result Monad and Degradation Policy Engine to guarantee strict control flow, prevent crashes, and maintain 60fps performance by completely eradicating exceptions in runtime.

## What Changes

- **Boot-time Validation**: Refactor `ConsistencyChecker` and individual validation rules to return a structured `Result<void, ValidationError>` or push to `ValidationContext`, halting boot gracefully only in strict mode without throwing a native exception.
- **Runtime Hot Paths**: Surgically remove all `try/catch` blocks from `AutomationEngine`, `AudioBusSystem`, and DSP Plugins. Replace with mathematical pre-validation (e.g., checking for `NaN`, `Infinity`, boundary overlaps). If invalid, return an internal `Err`, drop the voice or skip the automation ramp (Degradation Policy), and emit a telemetry event.
- **Public API Async Boundaries**: Wrap external interactions like `unlock()` and `decodeAudioData` in `Result<T, AudioPolicyError | DecodeError>` and return to the UI layer, giving the game host explicit, typed failure states.
- **Remove Dummy Buffers**: Delete `getDummyBuffer()` logic. Drop voices outright to conserve RAM/CPU upon fetch or decode failures.

## Capabilities

### New Capabilities

- `audio-engine/degradation-policies`: Governs fallback rules, error culling, and Result Monad boundaries for the Audio Engine, defining how the engine safely degrades without crashing.

### Modified Capabilities

- 

## Impact

- **Affected Layers**:
  - Application Layer (`AudioEngine` boundaries)
  - Infrastructure Layer (`AudioBufferLoader`, `UnlockManager`, `AutomationEngine`, `AudioBusSystem`, DSP Plugins)
  - Domain Layer (`ConsistencyChecker`, Routing Policies)
  - Shared Layer (Introduces the new `Result<T, E>` monad type)
- **Dependency Rule Check**: The dependency rule (inward to Domain) remains strictly unbroken. The `Result` monad will reside in the Shared layer, accessible across all layers. Domain logic orchestrates the Degradation Policy without relying on Infrastructure implementation details.
- **Repository Evidence (Repowise)**:
  - `AudioEngine.ts` is a critical global hotspot (98% score) with 25 co-change partners. Changing its `init` signature and public methods requires strict adherence to our TDD migration plan to avoid rippling breakages.
  - `AutomationEngine.ts` is highly coupled (12 direct dependents) and tightly tied to `PlaybackScheduler.ts` and `AudioRouter.ts`. Removing its `try/catch` blocks must be explicitly verified against the `PlaybackScheduler` tests.
