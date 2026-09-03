# Files

- [Bus system and analyzer taps](bus-system.md) - Bus graph construction, send routing, analyzer and ducker tap placement, and the Web Audio boundary that the engine exposes to mixers and inspector tooling.
- [Audio Context and Unlock Lifecycle](context.md) - Browser audio-context creation, unlock handling, listener control, and worklet loading for the engine runtime.
- [Sound Instances and Voice Pooling](instance.md) - Runtime sound-instance state and pool management for reusing voices safely without allocation churn.
- [Loaders and Sound Control](loader.md) - Runtime asset loading, bank lifecycle management, and controller adapters that expose decoded buffers to playback code.
- [Nodes and master output](nodes.md) - Audio node factories, node-chain composition, and the final master-output path used by the engine bus system.
- [Engine infrastructure overview](overview.md) - Map of the Web Audio adapters, loaders, scheduling, telemetry, state, and worklet subsystems behind the engine package.
- [Plugins, sidechain, and limiter](plugins.md) - Audio plugin implementations for filters, sidechain ducking, and the custom brickwall limiter used by the bus system.
- [Scheduling and culling](scheduling.md) - Engine ticker integration, playback scheduling, culling evaluation, and context-driven frame processing for active voices.
- [Runtime state registries](state.md) - History registries that preserve container and switch playback state across transitions and repeated selections.
- [Telemetry transports](telemetry.md) - Engine-side telemetry dispatchers, snapshotters, and transport adapters for browser, worker, and broadcast channels.
- [Worklets](worklets.md) - Audio-thread and inspector worklet processors used for ducking, limiting, and metering.
