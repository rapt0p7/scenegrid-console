---
type: infrastructure subsystem
title: Telemetry transports
description: Engine-side telemetry dispatchers, snapshotters, and transport adapters for browser, worker, and broadcast channels.
tags: [engine, telemetry, transport]
verified:
  - by: openwiki/0.5.1
    at: 2026-09-27T15:02:32.352Z
sources:
  - id: openwiki-source-a6cd3ba5b282a78dba9614b7
    resource: repo://packages/engine/src/Infrastructure/telemetry/TelemetryDispatcher.ts
  - id: openwiki-source-31719f824200e2413a666c58
    resource: repo://packages/engine/src/Infrastructure/telemetry/WorkerTelemetryTransport.ts
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
