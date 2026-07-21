# IDE Autocomplete for Configs

## Background
Currently, the SceneGrid AudioEngine facade uses raw `string` types for identifiers like `soundId` (e.g. `engine.play('string')`) and `eventId` (e.g. `engine.postEvent('string')`). While internal branded types like `SoundId` exist for safety, consumers lack IDE autocomplete for these string literals based on their provided configurations.

## Scope
Introduce strongly typed facades for the AudioEngine using Declaration Merging, allowing the end-user's game configurations to drive IDE autocomplete in `engine.play()`, `engine.postEvent()`, and other similar API surfaces, all without requiring explicit generic parameters.

## Goals
- Enhance developer experience with out-of-the-box IDE autocomplete for string literals.
- Eliminate the need to pass explicit type generics down to the `AudioEngine`.
- Maintain backwards compatibility (fallback to `string` if no custom config is merged).

## Non-Goals
- Changing the internal branded types or validation logic.
- Rewriting the runtime config loading logic.
