# Tasks: IDE Autocomplete for Configs

- [ ] 1. Define Registry interfaces in `@scene-grid/shared/src/Types/Branded.ts` (e.g., `SoundIdRegistry`, `EventIdRegistry`, `SnapshotIdRegistry`, `GameParamIdRegistry`, `BankIdRegistry`, `BusIdRegistry`).
- [ ] 2. Create fallback string conditional types (e.g., `ValidSoundString`, `ValidEventString`, etc.).
- [ ] 3. Update the branded types (`SoundId`, `EventId`, `SnapshotId`, `GameParamId`, `BankId`, `BusId`) to use the conditional types instead of `string`.
- [ ] 4. Update `IAudioEngine.ts` and `IAudioEngineConfig.ts` to ensure the parameter types for methods like `play`, `postEvent`, `mixer.setState` leverage the proper literal types instead of raw `string` where applicable. (Actually, `ValidSoundString` etc might be all we need).
- [ ] 5. Add unit/type tests in `@scene-grid/shared` to verify the conditional types fallback correctly to `string` when the registries are empty, and resolve to literals when augmented.
