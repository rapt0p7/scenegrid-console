## 1. Infrastructure (SharedWorker)

- [x] 1.1 Create `packages/shared/src/Workers/TelemetryWorker.ts` script to act as the `SharedWorker`
- [x] 1.2 Implement internal state in `TelemetryWorker.ts` to buffer `MANIFEST`, `VALIDATION_REPORT`, `latestSnapshot`, and a circular array for `logs`
- [x] 1.3 Implement message handling in `TelemetryWorker.ts` to receive telemetry from the Engine and distribute it to all connected Inspector ports
- [x] 1.4 Implement connection logic in `TelemetryWorker.ts` to instantly replay the buffered state to any newly connected port

## 2. Engine Layer

- [x] 2.1 Update `BroadcastTelemetryTransport.ts` (or create a new `WorkerTelemetryTransport.ts`) to instantiate and connect to `TelemetryWorker.ts` via `MessagePort` instead of `BroadcastChannel`
- [x] 2.2 Update `CommandReceiver.ts` to also use the `SharedWorker` for receiving commands from the Inspector
- [x] 2.3 Verify the engine successfully dispatches its initial payload to the worker upon boot

## 3. Inspector Layer

- [x] 3.1 Update `useTelemetryBus.ts` to connect to `TelemetryWorker.ts` instead of using `BroadcastChannel`
- [x] 3.2 Update `useCommandTransmitter.ts` to send commands via the `SharedWorker` port
- [x] 3.3 Ensure `useTelemetryBus.ts` clears its historical state (`logs`, `consistencyReport`, `ramReport`, `latestSnapshot.current`) whenever a new `MANIFEST` payload is received
- [x] 3.4 Test: Verify inspector properly loads full historical state from the worker when opened after the engine is running
- [x] 3.5 Test: Verify inspector properly resets and clears old logs when the engine page is reloaded
- [x] 3.6 Run `npm run lint` and `npm run typecheck` to verify changes and clear any oxc warnings
