# Design: ConsistencyChecker Refactoring

## Architecture
We will extract the state and assertion methods from `ConsistencyChecker` into a `ValidationContext`. `ConsistencyChecker` will become a composition root that invokes a list of `IValidationRule` plugins.

### Interfaces
```typescript
export interface IValidationContext {
    readonly config: IConsistencyCheckerPayload;
    addError(message: string): void;
    addWarning(message: string): void;
    assertRequiredType<K extends keyof TypeMap>(path: string, value: unknown, expectedType: K): boolean;
    assertOptionalType<K extends keyof TypeMap>(path: string, value: unknown, expectedType: K): boolean;
    assertArray(path: string, value: unknown, isOptional?: boolean): boolean;
}

export interface IValidationRule {
    validate(context: IValidationContext): void;
}

export interface ISoundValidationRule {
    validate(soundId: string, cfg: AnySoundConfig, context: IValidationContext): void;
}
```

### Components
1. **ValidationContext**: Holds the current `config`, collects `errors` and `warnings`, and provides common assertion methods.
2. **ConsistencyChecker**: Initializes the `ValidationContext` and orchestrates all the validation rules.
3. **Core Rules**: Implementations of `IValidationRule` such as `RoutingCyclesRule`, `BusesRule`, `SnapshotsRule`, `GhostDuckingRule`, `RTPCManifestRule`, etc.
4. **Sound Sub-Rules**: `SoundMapRule` will iterate over `config.soundMap` and delegate specific configuration checks to `ISoundValidationRule`s (e.g., `SmartLoopRule`, `SwitchSoundRule`, `ScattererSoundRule`).

## Testing Strategy
The existing `ConsistencyChecker.test.ts` (2600+ lines) will serve as our Integration Test Suite. Because `ConsistencyChecker.validate(config)` will retain its exact public signature and return type (collecting identical error strings), all tests should pass unmodified, guaranteeing backward compatibility.
