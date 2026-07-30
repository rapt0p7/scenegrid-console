# Proposal: Add Sequencer PPQN

## What and Why
Introduce Pulses Per Quarter Note (PPQN) functionality to the `AudioGrid` and `Sequencer` systems. By default, standard audio grids align to beats or bars. Adding a high-resolution PPQN grid (e.g., 96, 480, or 960) aligns our audio sequencer with mature middleware like Wwise and FMOD, enabling ultra-precise timing for stingers, events, and dynamic quantization. It resolves floating-point time drift issues by ensuring grid math uses exact integer multiplications before dividing to float seconds.

## Architectural Layers Affected
- **Domain Layer**: `AudioGrid`, `Sequencer`, `QuantizeType`
- **Application Layer**: `AudioEngine`, `IAudioEngineConfig`

## Dependency Rules Confirmation
The dependency rule remains unbroken. The Domain layer (`AudioGrid`, `Sequencer`, `Ports`) will not import anything from the Infrastructure or Application layers. Configuration details (like the PPQN value) will flow inward from the Application layer (`IAudioEngineConfig`) to the Domain via explicit Ports and pure functions.
