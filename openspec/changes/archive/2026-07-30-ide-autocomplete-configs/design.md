# Design: IDE Autocomplete for Configs

## Architecture

We will implement **Declaration Merging** to strongly type the facade arguments.

1. **Registry Interface**: Add an empty interface `SceneGridRegistry` in `@scene-grid/engine` (`packages/engine/src/Application/Ports/SceneGridRegistry.ts`).
2. **Conditional Autocomplete Types**: Create types like `AutocompleteSound`, `AutocompleteEvent`, etc. that resolve to the keys of specific properties within `SceneGridRegistry`. If no keys are merged, they fall back to `string & {}` (which preserves string literal autocomplete hints while allowing any string).
3. **Facade Updates**: Update `IAudioEngine` and `IAudioEngineConfig` method signatures to use these new autocomplete types instead of raw `string`.

### Type Mechanics
In `packages/engine/src/Application/Ports/SceneGridRegistry.ts`:

```typescript
export interface SceneGridRegistry {}

type ExtractRegistry<K extends string> = K extends keyof SceneGridRegistry ? SceneGridRegistry[K] : string;

// The `(string & {})` ensures that any string is valid, but TS still suggests the known literals.
export type AutocompleteSound = ExtractRegistry<'SoundIds'> | (string & {});
export type AutocompleteEvent = ExtractRegistry<'EventIds'> | (string & {});
export type AutocompleteBank = ExtractRegistry<'BankIds'> | (string & {});
export type AutocompleteSnapshot = ExtractRegistry<'SnapshotIds'> | (string & {});
export type AutocompleteGameParam = ExtractRegistry<'GameParamIds'> | (string & {});
```

### Usage Example
Consumer code:
```typescript
import { SoundMap } from './config';

declare module '@scene-grid/engine' {
    interface SceneGridRegistry {
        SoundIds: keyof typeof SoundMap;
    }
}

// Now `engine.play('explosion')` will autocomplete.
```

## Risks and Mitigation
- **Risk**: Breaks existing code that relies on passing arbitrary strings.
- **Mitigation**: Using `(string & {})` as a fallback ensures that if a user merges the registry, they get autocomplete for those literals, but can STILL pass any valid string if they need to. It degrades gracefully and does not strictly enforce the literals, prioritizing IDE DX (Developer Experience) over strict type limitation.
