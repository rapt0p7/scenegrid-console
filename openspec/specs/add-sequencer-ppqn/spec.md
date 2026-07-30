## Purpose
TBD

## Requirements

### Requirement: High-Resolution PPQN Audio Grid
The system SHALL implement a Pulses Per Quarter Note (PPQN) functionality in the `AudioGrid` and `Sequencer` systems to support ultra-precise timing for stingers, events, and dynamic quantization without floating-point time drift.

#### Scenario: Global Configuration
- **WHEN** the `AudioEngine` is initialized
- **THEN** it SHALL accept an optional `sequencer.ppqn` configuration value (defaulting to 960)

#### Scenario: Evaluating Exact Time
- **WHEN** the Sequencer or AudioGrid calculates the elapsed time for a specific pulse
- **THEN** the system SHALL calculate the exact float time using pure integer math (e.g., `(60 * targetPulseIndex) / (bpm * ppqn)`) before dividing to a float

#### Scenario: Supporting New Quantize Types
- **WHEN** a transition or stinger specifies a `QuantizeType` of `NextGridDivision` or `ExactPulse`
- **THEN** the `Sequencer` SHALL calculate absolute target times using the new `AudioGrid` pulse resolution methods
