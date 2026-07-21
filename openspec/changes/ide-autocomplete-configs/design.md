# Design: IDE Autocomplete for Configs

## Architecture

We will implement **Declaration Merging** to strongly type the facade arguments.

1. **Registries**: Add empty interfaces in `@scene-grid/shared` (e.g., `SoundIdRegistry`, `EventIdRegistry`, `SnapshotIdRegistry`, etc.).
2. **Conditional Types**: Update the identifier types to resolve to the merged keys. If no keys are merged, it falls back to `string`.
3. **Facade Updates**: Update `IAudioEngine` and `IAudioEngineConfig` method signatures to use these new conditional types instead of raw `string`.

### Type Mechanics
In `@scene-grid/shared/src/Types/Branded.ts`:

```typescript
// 1. Empty Registry for consumers to augment
export interface SoundIdRegistry {}

// 2. Type Resolver
export type KnownSoundId = keyof SoundIdRegistry;
export type ValidSoundString = KnownSoundId extends never ? string : KnownSoundId;

// 3. Update the Branded type to accept the literal
export type SoundId = ValidSoundString & { readonly __brand: unique symbol };
```

And similar mechanics for `EventIdRegistry`, `BusIdRegistry`, `SnapshotIdRegistry`, `GameParamIdRegistry`, and `BankIdRegistry`.

### Usage Example
Consumer code:
```typescript
import { SoundMap } from './config';

declare module '@scene-grid/shared' {
    interface SoundIdRegistry extends Record<keyof typeof SoundMap, any> {}
}

// Now `engine.play('explosion')` will autocomplete.
```

## Risks and Mitigation
- **Risk**: Breaks existing code that relies on passing arbitrary strings not in the registry.
- **Mitigation**: If a user merges the registry, they *want* strictness. For users who don't augment the interface, it degrades gracefully to `string`. To bypass strictness, the user can still cast `as any` or use `// @ts-ignore`.
