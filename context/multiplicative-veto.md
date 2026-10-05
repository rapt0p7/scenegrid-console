## Multiplicative Veto validation rule

**Type:** decision
**Status:** active
**Evidence:** confirmed
**Source:** `MultiplicativeVetoesRule.ts`, docs/architecture commits
**Revisit when:** the engine's gain staging or validation logic changes

The `ConsistencyChecker` enforces a "Multiplicative Veto" rule that warns developers if a snapshot explicitly modifies the gain of a bus that is already driven by an RTPC curve. 

**Reason:** Because the final bus gain is a product of these values (`Final = snapshot.gain * RTPC`), a manual override in a snapshot can unpredictably scale down or completely mute (zero out) the resulting gain, leading to "ghost ducking" or silent buses that are difficult to debug.

**Rejected alternative:** Allowing unrestricted, silent multiplicative gain combinations. Rejected because it led to unpredictable audio routing bugs where snapshot overrides and RTPCs conflicted.
