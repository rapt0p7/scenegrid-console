---
type: infrastructure subsystem
title: Loaders and bank management
description: Asset loading, bank lifecycle, and sound-controller adapters that bridge manifests to decoded runtime buffers.
tags: [engine, loading, banks]
---

# Loaders and bank management

This subsystem owns the asset-loading path from manifest to decoded buffer and bank lifecycle.

## Owned modules

- `AudioBufferLoader` fetches and decodes buffers.
- `BankManagerAdapter` manages bank load/unload state.
- `SoundController` bridges the loader and runtime playback layer.

## Responsibilities

- load individual resources and batched bank resources;
- track bank state changes;
- expose buffer availability to runtime playback;
- keep loading behavior observable through focused tests and engine events.

## Representative tests

- `packages/engine/src/Infrastructure/loader/__tests__/AudioBufferLoader.test.ts`
- `packages/engine/src/Infrastructure/loader/__tests__/BankManagerAdapter.test.ts`
- `packages/engine/src/Infrastructure/loader/__tests__/SoundController.test.ts`

## Scope boundary

This page covers asset loading and bank lifecycle only. Play scheduling and playback selection live in the domain routing/orchestration pages.
