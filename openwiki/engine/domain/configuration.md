---
type: domain subsystem
title: Configuration and sound registry
description: Manifest-backed configuration types and the sound registry that bridge authoring data to runtime playback identities.
tags: [engine, configuration, registry]
---

# Configuration and sound registry

This subsystem bridges authored manifests to engine runtime identities.

## Owned modules

- configuration port types for banks, events, music FSM, RTPC, sound maps, and sound manifests;
- `SoundRegistry` as the runtime registry object used during engine initialization.

## Responsibilities

- normalize manifest-backed data into runtime lookup structures;
- preserve the distinction between authored IDs and resolved runtime values;
- provide a stable registry surface for `AudioEngine` startup and downstream consumers.

## Representative tests

- `packages/engine/src/Domain/Configuration/__tests__/SoundRegistry.test.ts`

## Scope boundary

This page does not duplicate the validation rules that check configuration correctness. Those belong to the validation page.
