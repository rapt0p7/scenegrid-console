# Files

- [Configuration and Sound Registry](configuration.md) - Documents sound configuration ports, manifests (ISpriteSoundManifest, IStreamManifest), SoundRegistry, BankManagerAdapter, and aggregate audio engine configuration.
- [Domain Mixer and Snapshot Resolution](mixer.md) - Mixer snapshot layering, priority order, and the transition engine that resolves layered state into live bus updates and telemetry.
- [Domain orchestration](orchestration.md) - Event dispatch, sequenced music control, music FSM evaluation, scatterer spawning, and quantized loop-transition coordination in the engine domain.
- [Router and Playback Managers](router-and-managers.md) - Runtime routing and playback decision logic that selects concrete sounds, applies culling and playback policies, and wires ducking and RTPC state onto active voices.
- [Domain Validation and Consistency Checking](validation.md) - The engine startup validation gate that checks configuration structure, cross-reference consistency, and routing safety before initialization completes.
