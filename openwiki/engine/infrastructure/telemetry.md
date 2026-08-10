---
type: infrastructure subsystem
title: Telemetry transports
description: Engine-side telemetry dispatchers, snapshotters, and transport adapters for browser, worker, and broadcast channels.
tags: [engine, telemetry, transport]
---

# Telemetry transports

This subsystem owns engine-side telemetry publication and transport adaptation.

## Owned modules

- `TelemetryDispatcher`
- `TelemetrySnapshotter`
- `CommandReceiver`
- `BroadcastTelemetryTransport`
- `BrowserTelemetryTransport`
- `WorkerTelemetryTransport`
- `BroadcastIpcAdapter`

## Responsibilities

- serialize and ship engine telemetry;
- snapshot runtime state for debugger consumption;
- receive incoming commands where supported;
- adapt telemetry across browser, worker, and broadcast transport surfaces.

## Representative tests

- `packages/engine/src/Infrastructure/telemetry/__tests__/TelemetryDispatcher.test.ts`
- `packages/engine/src/Infrastructure/telemetry/__tests__/TelemetrySnapshotter.test.ts`
- `packages/engine/src/Infrastructure/telemetry/__tests__/CommandReceiver.test.ts`

## Scope boundary

This page covers transport and snapshot plumbing only. The inspector UI and command producer side live in the inspector pages.
