## Pre-calculation of AudioWorklet coefficients

**Id:** 546d7359-943f-4e16-a1d8-26f361ad623e
**Type:** decision
**Status:** active
**Evidence:** inferred
**Source:** `ducker.processor.ts`, `lookahead-brickwall-limiter.processor.ts`
**Revisit when:** the `AudioWorkletProcessor` implementations are rewritten

The `DuckerProcessor` and `TinyLimiter` processors pre-calculate their exponential coefficients (e.g., `Math.exp`) in their constructors, and use pre-allocated `Float32Array` buffers for delay lines, rather than calculating them dynamically inside the `process` loop.

**Reason:** Real-time audio processing within an `AudioWorklet` has an extremely strict time budget. Expensive mathematical operations or dynamic memory allocations during the `process` loop introduce computational overhead that can cause buffer underruns (audio glitches). *(Note: This reason and the rejected alternative are inferred from standard audio programming constraints and the pre-calculation pattern in the code, as explicit historical documentation was not found.)*

**Rejected alternative:** Calculating coefficients on-the-fly and allocating memory dynamically during the audio loop. Rejected due to the risk of audio thread starvation.
