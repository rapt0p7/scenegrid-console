## Context

Mobile web games suffer from strict memory limitations. The current `AudioBufferLoader` uses an unbounded Map to cache raw audio buffers indefinitely, directly leading to out-of-memory (OOM) crashes on low-end devices during long play sessions.

## Goals / Non-Goals

**Goals:**
- Proactively track the cumulative PCM byte size of all loaded `AudioBuffer`s.
- Automatically evict unused audio buffers using a zero-allocation Array-Backed LRU cache.
- Expose a semantic priority system (`high`/`low`) to prevent eviction of critical sounds.
- Support AOT size calculations while keeping the core engine 100% build-tool agnostic.

**Non-Goals:**
- We will NOT attempt to asynchronously reload evicted buffers on the fly.
- We will NOT bind the engine runtime to a specific bundler (no hardcoded Vite virtual modules).

## Decisions

- **Zero-Allocation Array-Backed LRU**: Avoids GC churn on the hot path by storing cache structures in typed arrays (`#bufferSizes`, `#priorities`, `#next`, `#prev`).
- **Free Index LIFO Stack**: A pre-allocated `#freeIndices` stack ensures $O(1)$ empty slot identification.
- **$O(1)$ Reverse URL Mapping**: Parallel array `#indexToUrl: string[]` allows instant string resolution.
- **Dependency Inversion for Sizes**: `IAudioEngineConfig` will accept an optional `precalculatedSizes?: Record<string, number>`. The engine remains pure and universally installable.
- **Runtime Fallback**: `BankManagerAdapter` will use `precalculatedSizes`. If a URL is missing, it falls back to a safe default (e.g., 5.0 MB) and emits a console warning.
- **External AOT Tooling**: AOT calculation logic is moved out of the engine package into an optional developer tool (CLI or standalone plugin).

## Risks / Trade-offs

- **[Risk] Playback Dropping**: A sound explicitly dropped will not play. → **Mitigation**: Critical UI sounds are locked under `priority: 'high'`. Emergency evictions emit `OOM_CRITICAL_EVICTION`.
- **[Risk] Missing AOT Data**: Uncalculated sounds default to 5MB, potentially skewing the quota. → **Mitigation**: A console warning alerts the developer to missing size calculations, encouraging them to run the external tooling.
