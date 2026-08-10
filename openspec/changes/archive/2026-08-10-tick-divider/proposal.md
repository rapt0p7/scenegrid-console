## Why

The current `EngineTicker` allows systems to register with arbitrary millisecond intervals. When these intervals do not align perfectly with the engine's 15ms base rate, unpredictable phase drift (jitter) occurs due to time accumulator remainders. This desyncs scheduled notes, automation curves, and spatial updates over time, which is unacceptable for a real-time digital mixing console.

## What Changes

- Refactor `EngineTicker` to use a "Tick Divider" (Control Rate) architecture instead of arbitrary millisecond accumulators.
- The `EngineTicker` will evaluate a single `currentTick` integer and execute tasks based on modulo arithmetic (`currentTick % task.divider === 0`).
- **BREAKING**: Modify the `IEngineTicker` registration contract (e.g., `EngineTicker.add`) to accept an integer `divider` instead of a millisecond `interval`.
- Migrate existing systems (`AutomationEngine`, `AudioBusSystem`, `MusicConductor`, `Sequencer`, etc.) to use integer dividers based on their required update frequency.

## Capabilities

### New Capabilities
- `tick-divider-scheduling`: Defines the Control Rate architecture and requirements for exact deterministic batch execution within the audio engine.

### Modified Capabilities

## Impact

- **Affected Layers:** Infrastructure (`EngineTicker`, `AutomationEngine`, `AudioBusSystem`) and Domain (`ITickable` port, Orchestrators like `MusicConductor` and `Sequencer`).
- **Dependency Rule Check:** This change preserves the dependency rule. The Infrastructure layer (where `EngineTicker` resides) still depends inward on the Domain layer's `ITickable` port. The Domain continues to have zero side-effects and absolute isolation.
- **Affected Systems:** All systems that rely on time-based updates will execute deterministically on aligned boundaries, permanently eliminating jitter.
