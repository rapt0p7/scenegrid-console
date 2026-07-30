# Proposal: Interactive Music Conductor (FSM)

## What and Why

Introduce a deterministic music state machine (`MusicConductor`) into the Domain Layer to act as the high-level interactive music orchestrator.

The Conductor solves the problem of uniting the Sequencer and Snapshot Manager under a single data-driven entity. The architecture is built on a polling principle (`ITickable` model), evaluates the transition graph via a pure `evaluateEdges` function, operates on a **Zero Allocation** principle (0 bytes allocated at runtime), and ensures full `sample-accurate` precision through direct integration with the sequencer's musical grid logic.

## Architectural Layers Affected

* **Domain Layer**: `MusicConductor`, `evaluateEdges` (FSM logic), `IConductorState` (state infrastructure).
* **Application Layer / Facade**: `AudioEngine` (initializes, triggers `start()` during the user input phase, and passes ticks via a unified `EngineTicker`).
