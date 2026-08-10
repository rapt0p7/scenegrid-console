## 1. Domain Ports (IEngineTicker)

- [x] 1.1 Write failing type-check test for `IEngineTicker.add` using a `divider` parameter instead of `interval`.
- [x] 1.2 Update `IEngineTicker` port (`packages/engine/src/Domain/Shared/Ports/IEngineTicker.ts`) to expect `divider` (integer) instead of `interval` (milliseconds).
- [x] 1.3 Clear oxc linting warnings and verify Domain layer type checks pass.

## 2. Infrastructure (EngineTicker)

- [x] 2.1 Write/update failing unit tests in `EngineTicker.test.ts` to expect deterministic modulo execution instead of time accumulation.
- [x] 2.2 Refactor `EngineTicker.ts` to track `currentTick` and use modulo division (`currentTick % task.divider === 0`) for dispatching ticks.
- [x] 2.3 Verify `EngineTicker` tests pass and clear oxc linting warnings.

## 3. Migrate Consumer Systems

- [x] 3.1 Update tests in `Sequencer.test.ts` and `AudioBusSystem.test.ts` to pass integer dividers instead of milliseconds.
- [x] 3.2 Refactor Infrastructure consumers (e.g., `AutomationEngine`, `AudioBusSystem`, `CommandReceiver`) to register with `divider`.
- [x] 3.3 Refactor Domain orchestrators (e.g., `MusicConductor`, `Sequencer`, `ScattererOrchestrator`) to register with `divider`.
- [x] 3.4 Run full test suite (`npm run test`) to verify deterministic batching and clear any remaining oxc linting warnings.
