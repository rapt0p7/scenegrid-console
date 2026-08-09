## Why

Currently, the SceneGrid engine broadcasts its initial state (manifest) exactly once on startup via `BroadcastChannel`. If the inspector is opened after the engine, it misses this critical state payload and all historical telemetry, failing to initialize properly. Conversely, if the engine is reloaded while the inspector is open, the inspector retains stale historical logs. 

Because the engine's telemetry dispatcher relies on zero-allocation memory mutation for performance, it cannot buffer or re-dispatch historical state. This change introduces a `SharedWorker` to act as a stateful middleman, providing full historical recovery for late-joining inspectors without requiring any architectural changes to the engine's dispatcher.

## What Changes

- Replace `BroadcastChannel` with a `SharedWorker` for telemetry transport.
- The `SharedWorker` will receive and buffer the `MANIFEST`, `VALIDATION_REPORT`, the latest `SNAPSHOT`, and a rolling window of recent telemetry logs.
- When the Inspector connects to the `SharedWorker`, the worker will immediately replay the buffered state to fully synchronize the inspector, and then pipe live updates.
- If the Engine reloads, it connects to the `SharedWorker` and sends a new `MANIFEST`, prompting the worker to clear its historical buffer and the inspector to reset its UI state.

## Capabilities

### New Capabilities
- `inspector-engine-sync`: Establishes a robust state recovery and synchronization mechanism between the standalone inspector and the audio engine via a SharedWorker middleman.

### Modified Capabilities


## Impact

- **Affected Code**: `BroadcastTelemetryTransport` (replaced with Worker transport), `useTelemetryBus` (inspector layer).
- **Architecture Validation**: This maintains the unidirectional flow of telemetry and strict isolation. The Domain layer remains completely unaffected. The Engine continues to blindly dispatch telemetry, shifting the buffering responsibility to a dedicated infrastructure worker.
