# Tasks: IDE Autocomplete for Configs

- [x] 1. Create `SceneGridRegistry.ts` in `packages/engine/src/Application/Ports/`.
- [x] 2. Define the empty `SceneGridRegistry` interface and the conditional `AutocompleteSound`, `AutocompleteEvent`, etc. types using `(string & {})` for flexible IDE autocomplete fallback.
- [x] 3. Update `IAudioEngine.ts` to replace raw `string` parameters with the new `Autocomplete*` types in facade methods (`play`, `postEvent`, `mixer.setState`, etc.).
- [x] 4. Export the new `SceneGridRegistry` interface and types from `packages/engine/src/index.ts`.
