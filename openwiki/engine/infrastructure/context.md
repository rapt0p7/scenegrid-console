---
type: infrastructure subsystem
title: Context and unlock management
description: AudioContext creation, listener control, unlock flow, and worklet loading for the engine runtime.
tags: [engine, audio-context, unlock]
---

# Context and unlock management

This subsystem owns the browser audio context lifecycle. It is the first place the engine touches browser audio APIs directly.

## Owned modules

- `AudioContextFactory` creates or adapts the browser audio context.
- `AudioContextManager` wraps context access and listener operations.
- `ListenerManager` updates listener position and orientation.
- `UnlockManager` handles browser gesture-gated unlock behavior.
- `WorkletLoader` loads audio worklet modules.

## Responsibilities

- create or bind the running `AudioContext`;
- resume the context when user interaction allows it;
- manage listener position and orientation updates;
- load worklet modules needed by plugins and processors.

## Failure and lifecycle behavior

The relevant tests show that these modules must be safe under browser constraints:

- they should handle repeated or failed unlock attempts without corrupting state;
- they should keep listener updates isolated to the context manager;
- worklet loading should be observable and mockable for tests.

## Representative tests

- `packages/engine/src/Infrastructure/context/__tests__/AudioContextFactory.test.ts`
- `packages/engine/src/Infrastructure/context/__tests__/AudioContextManager.test.ts`
- `packages/engine/src/Infrastructure/context/__tests__/ListenerManager.test.ts`
- `packages/engine/src/Infrastructure/context/__tests__/UnlockManager.test.ts`
- `packages/engine/src/Infrastructure/context/__tests__/WorkletLoader.test.ts`

## Scope boundary

This page only covers the browser audio context boundary. Bus routing, limiter setup, and mixer transitions belong on their own pages.
