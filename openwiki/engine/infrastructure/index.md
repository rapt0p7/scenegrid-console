# Files

- [Bus system](bus-system.md) - The bus graph, master limiter path, sidechain behavior, and send application logic that bind engine mixes to Web Audio nodes.
- [Context and unlock management](context.md) - AudioContext creation, listener control, unlock flow, and worklet loading for the engine runtime.
- [Sound instances and pooling](instance.md) - Runtime sound-instance objects and pool management used to avoid allocation churn and manage playback reuse.
- [Loaders and bank management](loader.md) - Asset loading, bank lifecycle, and sound-controller adapters that bridge manifests to decoded runtime buffers.
- [Nodes and master output](nodes.md) - Audio node factories, node-chain composition, and the final master-output path used by the engine bus system.
- [Engine infrastructure overview](overview.md) - Map of the Web Audio adapters, loaders, scheduling, telemetry, state, and worklet subsystems behind the engine package.
- [Plugins, sidechain, and limiter](plugins.md) - Audio plugin implementations for filters, sidechain ducking, and the custom brickwall limiter used by the bus system.
- [Scheduling and culling](scheduling.md) - Engine ticker integration, playback scheduling, culling evaluation, and context-driven frame processing for active voices.
- [Runtime state registries](state.md) - History registries that preserve container and switch playback state across transitions and repeated selections.
- [Telemetry transports](telemetry.md) - Engine-side telemetry dispatchers, snapshotters, and transport adapters for browser, worker, and broadcast channels.
- [Worklets](worklets.md) - Audio-thread and inspector worklet processors used for ducking, limiting, and metering.
