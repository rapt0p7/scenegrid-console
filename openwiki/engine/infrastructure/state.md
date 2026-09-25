---
type: infrastructure subsystem
title: Runtime state registries
description: History registries that preserve container and switch playback state across transitions and repeated selections.
tags: [engine, state, history]
verified:
  - by: openwiki/0.5.1
    at: 2026-09-25T08:14:31.202Z
sources:
  - id: openwiki-source-452c81af9acc9fb46eb0fba1
    resource: repo://packages/engine/src/Infrastructure/state/ContainerHistoryRegistry.ts
  - id: openwiki-source-e78567def34a6399dc24cc2a
    resource: repo://packages/engine/src/Infrastructure/state/SwitchHistoryRegistry.ts
---

# Runtime state registries

This subsystem preserves playback history for routing policies that depend on previous choices.

## Owned modules

- `ContainerHistoryRegistry`
- `SwitchHistoryRegistry`

## Responsibilities

- remember previous container selection decisions;
- remember switch-state history across repeated playback requests;
- give policy objects a stable memory surface without forcing them to own persistence themselves.

## Representative tests

- `packages/engine/src/Infrastructure/state/__tests__/ContainerHistoryRegistry.test.ts`
- `packages/engine/src/Infrastructure/state/__tests__/SwitchHistoryRegistry.test.ts`

## Scope boundary

This page is intentionally narrow: it documents history storage, not selection policy. Selection rules belong to the router/managers page.
