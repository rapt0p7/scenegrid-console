## Data-oriented polling for parameter updates

**Id:** 99038614-eaca-4c68-8266-d49f4e96fccf
**Type:** decision
**Status:** active
**Evidence:** confirmed
**Source:** CHANGELOG.md Phase 18; `InstanceRTPCBinder.ts`
**Revisit when:** the audio engine's parameter binding architecture changes

In the Infrastructure and Orchestration layers (the data plane), the engine uses a zero-allocation pull model (`tickRTPC` in `InstanceRTPCBinder`) for parameter updates instead of event-driven push notifications. In-place mutations are mandatory, and `DeepReadonly` does not apply to this plane.

**Reason:** High-frequency audio parameter updates via event-driven callbacks lead to excessive object allocation. In a high-performance audio loop, this creates garbage collection pressure and GC spikes, causing audio dropouts and thread starvation. By iterating over a flat array of bindings during the engine's tick cycle, it avoids creating new closures or objects per frame.

**Rejected alternative:** Event-driven push notifications (event listeners per parameter change). Rejected because it causes GC spikes and overwhelms the audio thread with rapid-fire parameter changes.
