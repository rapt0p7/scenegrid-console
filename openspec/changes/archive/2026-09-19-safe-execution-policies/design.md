## Context
See `proposal.md` for motivation. We need to introduce a Result Monad and replace exceptions across the Boot-time and Runtime lifecycles of the Audio Engine without breaking the strict Domain-Driven Design isolation.

## Goals / Non-Goals

**Goals:**
- Introduce a lightweight `Result<T, E>` monad in the Shared layer.
- Eradicate `try/catch` and `throw` from `AutomationEngine`, `AudioBusSystem`, and all Validation Rules.
- Standardize Boot-time validation behavior to halt gracefully based on `strict` mode.
- Formalize a voice culling Degradation Policy for asset loading failures instead of allocating dummy buffers.

**Non-Goals:**
- Complete rewrite of the Web Audio API wrappers beyond exception-handling boundaries.

## Decisions

### 1. Lightweight Result Monad
- **Decision**: Implement a discriminated union `type Result<T, E> = { ok: true, value: T } | { ok: false, error: E }` in `packages/shared/src/Types`.
- **Rationale**: Lightweight, zero dependencies, perfectly compatible with TypeScript's type narrowing, and avoids class instantiation overhead on the hot path.
- **Alternatives**: Using a third-party library like `neverthrow`. Rejected because we want to minimize dependencies in the Shared Kernel and keep the footprint tiny.

### 2. Pre-validation over try/catch
- **Decision**: Remove `try/catch` blocks from `AutomationEngine` and `AudioBusSystem`. Replace them with mathematical checks (e.g., `Number.isFinite`, `endTime >= currentTime`). If invalid, return an internal `Err` and skip the operation.
- **Rationale**: V8 deoptimizes functions containing `try/catch` blocks, which is fatal for a 60fps audio automation ticker. Pre-validation keeps the JIT compiler optimized.

### 3. Voice Culling Degradation Policy
- **Decision**: When `AudioBufferLoader` returns an `Err(DecodeError)` instead of throwing, the `AudioRouter` and `BankManagerAdapter` evaluate the `Result`. They will immediately cull the voice and emit a telemetry event, skipping hardware routing.
- **Rationale**: The previous approach of creating a silent `dummy buffer` consumed memory and Web Audio graph nodes for no audible benefit. Culling is virtually free.

### 4. Boot-time Error Accumulation
- **Decision**: Validation rules (`ConsistencyChecker`, `RoutingCyclesRule`) will no longer `throw`. They will push errors to `ValidationContext`. `ConsistencyChecker.validate` will return a structured representation of these errors. `AudioEngine.init` will inspect this and safely return an `Err` if `isStrictValidation` is true.
- **Rationale**: Allows collecting multiple validation errors at once instead of failing fast on the first exception, providing better developer experience during configuration debugging.

## Risks / Trade-offs
- **Risk**: Verbose propagation of `Result` types across the codebase.
- **Mitigation**: We will only enforce `Result` on the external boundaries (`unlock`, `loadBank`) and specific inter-layer boundaries where degradation policies apply. Purely synchronous internal state mutations that cannot fail will continue to return primitive types or `void`.
