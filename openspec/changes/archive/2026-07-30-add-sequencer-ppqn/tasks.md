# Tasks: Add Sequencer PPQN

## Block 1: Domain Ports & Configuration

- [x] Write failing unit test in `packages/engine/src/Domain/Orchestration/__tests__/AudioGrid.test.ts` for exact pulse retrieval and drift-free validation at 960 PPQN.
- [x] Update `@scene-grid/shared` to expand `QuantizeType` with `NextGridDivision` and `ExactPulse`.
- [x] Update `IAudioEngineConfig.ts` to include the optional `sequencer: { ppqn?: number }` object.
- [x] Update `IAudioGrid.ts` interface to include `ppqn` property, `getTimeAtPulse`, and `getPulseAtTime`.
- [x] Clear oxc lint warnings for `IAudioEngineConfig.ts` and `IAudioGrid.ts`.

## Block 2: AudioGrid Implementation

- [x] Implement PPQN logic in `AudioGrid.ts`. Use integer-based multiplication before division (`(60 * pulse) / (bpm * ppqn)`) to avoid fractional drift.
- [x] Verify `AudioGrid.test.ts` passes.
- [x] Clear oxc lint warnings in `AudioGrid.ts`.

## Block 3: Sequencer Subdivisions

- [x] Write failing test in `Sequencer.test.ts` to verify quantization with `{ type: 'ExactPulse', pulseOffset: 480 }`.
- [x] Update `Sequencer.ts` inside `transitionTo` and `playStinger` to pattern match the expanded `QuantizeType`.
- [x] Use `grid.getTimeAtPulse(...)` to resolve absolute times.
- [x] Pass the `ppqn` value down from `AudioEngine.ts` into the `Sequencer` or grid factory as needed.
- [x] Verify `Sequencer.test.ts` passes.
- [x] Run `npm run lint:fast` and ensure zero oxc warnings across modified files.
- [x] Run full test suite `npm run test` to ensure no regressions.
