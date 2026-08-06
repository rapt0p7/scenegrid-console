## Context

As detailed in `proposal.md`, AudioWorklet initialization currently fails in restrictive environments (strict CSP, tight iframes) due to `vite-worklet-isolator.ts` hardcoding a `blob:` URL strategy. We need to implement a fallback mechanism without altering the strict layering rules of the engine.

## Goals / Non-Goals

**Goals:**
- Guarantee successful `AudioWorkletNode` initialization across a wide range of browser security contexts.
- Abstract the loading complexity out of individual Audio Engine plugins.

**Non-Goals:**
- Completely rewriting the Vite build pipeline for assets.
- Changing the `worker-src` or Content Security Policies of the consuming applications.

## Decisions

### 1. Export Raw Strings Instead of Blob URLs from Isolator
**Rationale**: By changing `vite-worklet-isolator.ts` to export the transpiled JavaScript code as a raw string instead of a `blob:` URL, we defer the decision of *how* to load the worklet to runtime.
**Alternatives Considered**: Emitting an actual `.js` asset file via Vite. This was rejected because it introduces significant configuration overhead for the library's consumers (who would need to configure their bundlers to serve the asset correctly).

### 2. Introduce `WorkletLoader.ts` in Infrastructure
**Rationale**: Engine plugins currently call `ctx.audioWorklet.addModule(url)` directly. Introducing `WorkletLoader.ts` centralized this logic. It attempts `URL.createObjectURL(blob)`, catches DOMExceptions or related CSP block errors during `addModule`, and gracefully falls back to `data:application/javascript;base64,${btoa(code)}`.
**Alternatives Considered**: Baking the fallback into every plugin. Rejected to avoid violating DRY and scattering infrastructure concerns across multiple plugin implementations.

### 3. Dependency Injection for External Packages
**Rationale**: The `inspector` package needs to load its own worklets (like `meter.processor.ts`) but cannot depend on the `engine`. Instead of duplicating loader logic or moving UI-specific worklets into the engine, the `inspector` will define a port for loading worklets, and the host application (`examples/main.ts`) will inject the engine's `WorkletLoader`. This maintains strict package boundaries while centralizing complex fallback logic.

## Risks / Trade-offs

- **[Risk]** Base64 encoded strings are ~33% larger than raw text in memory.
  **Mitigation**: This only occurs in environments where `blob:` is explicitly blocked. The fallback is progressive. Furthermore, typical processor scripts are very small (a few KB), making the memory impact negligible.
- **[Risk]** `data:` URIs might still be blocked if the CSP enforces `worker-src 'self'` strictly without `data:`.
  **Mitigation**: If both fail, the loader will throw a clear Error, shifting the responsibility to the library consumer to adjust their strict CSP (which is unavoidable at that point without full static asset emission).
