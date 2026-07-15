# Tasks: Interactive Music Conductor

## Block 1: AudioGrid Refactor

- [x] Write tests in `AudioGrid.test.ts` for expanded quantization logic (`NextGridDivision`, `ExactPulse`).
- [x] Clean `Sequencer.ts` of time calculation math, fully encapsulating it within `AudioGrid.ts`.
- [x] Ensure timing calculations are based on integer multiplication without float accumulation drift.
- [x] Verify existing tests pass.

## Block 2: Conductor and Configuration

- [x] Create `IMusicFSMConfig.ts` in the domain layer, describing the declarative manifest schema.
- [x] Implement the `IConductorState.ts` interface in a flat, reusable format (no dynamic allocations).

## Block 3: The FSM Evaluator implementation

- [x] Write unit tests `MusicFsmEvaluator.test.ts` with 100% branch coverage (global edge priority, condition logic, empty condition checks).
- [x] Implement the pure function `evaluateEdges` to traverse the state graph.

## Block 4: Application Layer Integration and Validation

- [x] Implement the `MusicConductor` class supporting the `ITickable` interface and lifecycle methods `init`, `start`, `stop`.
- [x] Write comprehensive architectural tests `MusicConductor.test.ts` proving:
    * No side effects or API calls before the `start()` method.
    * Protection against double FSM triggers during the transition phase (`isTransitioning`).
    * Correct application of mixer quantization math based on the current track's grid.
- [x] **Zero Allocation** (maintaining state object referential identity during multiple transitions).


- [x] Integrate `checkMusicFSM` validation into the `ConsistencyChecker` static analyzer.
- [x] Write validation tests in `ConsistencyChecker.test.ts` covering all critical failure points (non-existent states, missing `smartLoop` section in used sounds, typos in transition region names, missing parameters in the RTPC manifest).
- [x]  Update integration in `AudioEngine.ts` to support `conductor.init` and `conductor.start` lifecycle methods during AudioContext unlock.
- [x]  Run the linter `npm run lint:fast` to ensure no oxc warnings.
- [x]  Run the full test pipeline `npm run test`.
