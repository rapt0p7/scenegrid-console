## Purpose
Establishes a robust synchronization protocol between the standalone inspector and the audio engine via a SharedWorker to decouple startup order and ensure full historical state recovery without relying on dispatcher mutation.

## ADDED Requirements

### Requirement: SharedWorker buffers telemetry state
The system SHALL route telemetry through a SharedWorker that maintains a rolling buffer of historical state.

#### Scenario: Engine dispatches telemetry
- **WHEN** the engine dispatches a `MANIFEST`, `VALIDATION_REPORT`, `SNAPSHOT`, or log packet to the transport layer
- **THEN** the SharedWorker stores the manifest, validation report, latest snapshot, and appends the log packet to a bounded circular buffer

### Requirement: Inspector recovers full history on boot
The inspector SHALL receive the complete buffered history from the SharedWorker immediately upon connection.

#### Scenario: Inspector boots after engine
- **WHEN** the inspector page is loaded and connects to the SharedWorker
- **THEN** the worker immediately transmits the buffered manifest, validation report, latest snapshot, and all buffered logs to the inspector
- **AND THEN** the inspector processes them as if it had been running the entire time

### Requirement: Inspector resets state on new manifest broadcast
The inspector SHALL treat any incoming `MANIFEST` payload as a new engine lifecycle boundary and immediately clear its historical state.

#### Scenario: Engine restarts while inspector is open
- **WHEN** the engine page is reloaded and sends a new `MANIFEST` to the SharedWorker
- **THEN** the SharedWorker clears its internal buffer
- **AND THEN** the inspector receives the new `MANIFEST` and clears all its existing telemetry logs, snapshots, and reports
