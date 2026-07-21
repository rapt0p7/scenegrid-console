# Tasks: ConsistencyChecker Refactoring

- [x] Create `IValidationRule.ts` and `IValidationContext.ts` ports.
- [x] Create `ISoundValidationRule.ts` port.
- [x] Create `ValidationContext.ts` core class with assertion methods.
- [x] Extract `checkRoutingCycles` into `RoutingCyclesRule.ts`.
- [x] Extract `checkBuses` into `BusesRule.ts`.
- [x] Extract `checkSnapshots` into `SnapshotsRule.ts`.
- [x] Extract `checkGhostDucking` into `GhostDuckingRule.ts`.
- [x] Extract `checkOrphanManifestSounds` into `OrphanManifestRule.ts`.
- [x] Extract `checkMultiplicativeVetoes` into `MultiplicativeVetoesRule.ts`.
- [x] Extract `checkRTPCManifest` into `RTPCManifestRule.ts`.
- [x] Extract `checkBankSystem` into `BankSystemRule.ts`.
- [x] Extract `checkEvents` into `EventsRule.ts`.
- [x] Extract `checkMusicFSM` into `MusicFSMRule.ts`.
- [x] Create `SoundMapRule.ts` to act as the sub-orchestrator for sound mapping.
- [x] Implement `ISoundValidationRule` classes: `LayeredSoundRule`, `ContainerSoundRule`, `SwitchSoundRule`, `SmartLoopRule`, `ScattererSoundRule`, `DuckingTargetRule`, `SpatialSettingsRule`.
- [x] Update `ConsistencyChecker.ts` to act as the composition root and run all rules.
- [x] Run `ConsistencyChecker.test.ts` and verify all integration tests pass perfectly.
