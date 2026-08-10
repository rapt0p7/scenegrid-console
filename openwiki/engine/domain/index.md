# Files

- [Configuration and sound registry](configuration.md) - Manifest-backed configuration types and the sound registry that bridge authoring data to runtime playback identities.
- [Mixer state and transitions](mixer.md) - Mixer snapshots, layer coordination, state resolution, and the timed transition engine that applies gains, filters, sends, and RTPC binding.
- [Orchestration and music control](orchestration.md) - Event orchestration, music FSM evaluation, smart-loop sequencing, scatterer behavior, and quantized transition logic.
- [Routing and playback managers](router-and-managers.md) - Audio routing, container and switch policies, ducking, RTPC binding, and the configuration-to-playback selection logic.
- [Validation pipeline](validation.md) - The engine configuration validation pipeline, including `ConsistencyChecker`, reporter fan-out, validation context, and the major rule families.
