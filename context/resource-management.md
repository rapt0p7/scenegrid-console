## Explicit degradation over exceptions for voice exhaustion

**Type:** decision
**Status:** active
**Evidence:** inferred
**Source:** `SoundPoolManager.ts`
**Revisit when:** the voice allocation or polyphony system is overhauled

When the engine reaches its polyphony limit and fails to find a suitable voice to steal, the `SoundPoolManager` returns explicit `RejectReason` values (`MAX_POLYPHONY`, `GLOBAL_LIMIT`, `PRIORITY_STEAL_FAILED`) instead of throwing errors.

**Reason:** Throwing exceptions during high-throughput, real-time audio orchestration risks unhandled promise rejections or engine crashes. Returning explicit failure states forces the calling code to handle resource degradation gracefully and predictably. *(Note: This rationale is inferred from the explicit `RejectReason` types defined in the manager, rather than recovered from a specific postmortem.)*

**Rejected alternative:** Throwing errors when a voice cannot be acquired. Rejected because implicit error handling in a real-time system is dangerous and degrades stability.
