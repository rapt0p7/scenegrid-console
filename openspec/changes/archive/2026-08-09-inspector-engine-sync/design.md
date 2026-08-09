## Context
As outlined in `proposal.md`, the standalone Inspector misses the Engine's initial state and historical telemetry if opened late. The Engine's `TelemetryDispatcher` and `Snapshotter` rely heavily on memory mutation and zero-allocation loops for performance, making it impossible to regurgitate historical state on demand without a major architectural rewrite.

## Goals / Non-Goals
**Goals:**
- Implement a state recovery mechanism providing *full* historical telemetry (manifest, latest snapshot, recent logs) to late-joining inspectors.
- Avoid any performance degradation or architectural changes to the Engine's dispatching logic.
- Ensure the inspector fetches complete static state upon late initialization.

**Non-Goals:**
- Refactoring the Engine's telemetry dispatcher or snapshotter.
- Persisting historical telemetry logs across browser restarts (ephemeral session state is fine).

## Decisions
**Decision 1: Use a SharedWorker as a Stateful Middleman**
- **Rationale**: We will introduce a `TelemetryWorker` (a Web `SharedWorker`). The Engine will dispatch all telemetry to this worker instead of a `BroadcastChannel`. The worker will maintain a stateful buffer (manifest, latest snapshot, rolling array of logs). When an Inspector connects to the worker, the worker immediately replays this buffered state to fully sync the Inspector. Passing data to a worker inherently clones it, safely isolating the history from the Engine's memory mutation.
- **Alternatives**: 
  - Using a two-way `REQUEST_SYNC` handshake. Rejected because the engine's dispatcher is not designed to re-dispatch past packets (like validation reports), meaning the inspector would receive incomplete data.
  - Using `localStorage`. Rejected because `localStorage` cannot efficiently handle the high-frequency tick data (snapshots and logs) needed for full historical recovery.

**Decision 2: Clear State on Manifest Receipt**
- **Rationale**: The `MANIFEST` payload serves as the definitive boundary of a new engine lifecycle. Whenever the `SharedWorker` or `useTelemetryBus` receives a new `MANIFEST` (e.g., when the Engine tab is reloaded), it will clear its internal `logs`, `latestSnapshot`, and any reports.
- **Alternatives**: Implementing a `sessionId` property on every log payload to filter stale logs. This adds overhead and complexity; clearing state on `MANIFEST` is simpler and sufficient.

## Risks / Trade-offs
- **Risk**: Passing large volumes of telemetry data through a `SharedWorker` introduces serialization overhead.
  - **Mitigation**: `SharedWorker` uses the same structured cloning algorithm as `BroadcastChannel`, so the performance profile is effectively identical to the current implementation, with the added benefit of isolated buffering.
