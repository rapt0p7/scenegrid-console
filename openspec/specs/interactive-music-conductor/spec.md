# Capability: Interactive Music Conductor

## Purpose
TBD - Orchestrate interactive music transitions and snapshot changes.

## Requirements

### Requirement: Interactive Music Conductor FSM
The system SHALL provide a deterministic, zero-allocation music state machine (`MusicConductor`) in the Domain Layer to orchestrate interactive music transitions and snapshot changes.

#### Scenario: Initializing the conductor
- **WHEN** the `MusicConductor` is initialized with a configuration (`IMusicFSMConfig`)
- **THEN** it SHALL load the FSM configuration and prepare the flat state structure without starting playback

#### Scenario: Starting the conductor
- **WHEN** the `start()` method is called
- **THEN** it SHALL start the initial musical loop and apply the initial mixer snapshot

#### Scenario: Evaluating transitions
- **WHEN** a tick occurs and the `evaluateEdges` function determines a valid transition based on the transition graph
- **THEN** it SHALL calculate the exact target time using `AudioGrid` integer math via the Sequencer

#### Scenario: Handling transitions with zero-allocation
- **WHEN** a transition is executed
- **THEN** it SHALL delegate sequencer transitions and stingers directly to the Sequencer, and cache snapshot switches in the flat state structure without allocating new objects

#### Scenario: Validating the configuration
- **WHEN** the `MusicFSM` configuration is loaded
- **THEN** the `ConsistencyChecker` SHALL perform static analysis to verify graph integrity, asset existence, region validity, and mixer snapshot validity
