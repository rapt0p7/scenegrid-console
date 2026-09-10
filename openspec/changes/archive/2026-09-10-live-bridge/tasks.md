## 1. Configuration & Connection Infrastructure

- [x] 1.1 Write a failing test for `TelemetryWorker` accepting a `remoteSyncUri` configuration and attempting a connection.
- [x] 1.2 Update `createTelemetryWorker.ts` and the worker initialization payload to accept an optional `remoteSyncUri` string. Verify typecheck passes.
- [x] 1.3 Implement WebSocket connection logic and an exponential backoff reconnection loop in `TelemetryWorker.ts`. Verify the connection test passes and clear all `oxc` linting warnings.

## 2. State Synchronization (FULL_SYNC)

- [x] 2.1 Write a failing test ensuring a `FULL_SYNC` payload containing the `TelemetryBatch` is emitted on WebSocket `onopen`.
- [x] 2.2 Implement the `ws.onopen` handler to serialize and send the worker's internal state as a `FULL_SYNC` message. Verify the test passes.

## 3. Telemetry Streaming

- [x] 3.1 Write a failing test for telemetry tick updates being forwarded to the WebSocket.
- [x] 3.2 Update the `TelemetryWorker` flush mechanism to serialize the telemetry batch to JSON and send it over the WebSocket (if `readyState === WebSocket.OPEN`). Verify the test passes and clear all `oxc` linting warnings.

## 4. Command Proxying

- [x] 4.1 Write a failing test for `onmessage` handling in the worker, verifying that valid JSON commands are proxied back to the `MessagePort`.
- [x] 4.2 Implement the `ws.onmessage` listener in `TelemetryWorker.ts`, parse the JSON payload, and `postMessage` it back to the main thread. Verify the test passes and clear all `oxc` linting warnings.
