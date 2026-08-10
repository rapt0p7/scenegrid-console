---
type: infrastructure subsystem
title: Plugins, sidechain, and limiter
description: Audio plugin implementations for filters, sidechain ducking, and the custom brickwall limiter used by the bus system.
tags: [engine, plugins, limiter, sidechain]
---

# Plugins, sidechain, and limiter

This subsystem owns the concrete audio plugins that extend the bus graph beyond simple gain nodes.

## Owned modules

- `FiltersPlugin` creates the filter processing chain.
- `SidechainDucker` implements lookahead ducking behavior.
- `TinyLimiterNode` provides the custom limiter path used by master output.

## Responsibilities

- create filter processing adapters for buses;
- manage sidechain sources and envelope behavior;
- insert lookahead when ducking triggers are used;
- provide a safe limiter fallback strategy when custom limiter loading fails.

## Failure behavior

The tests show that limiter initialization must be resilient. If the custom limiter worklet fails, the system should fall back to the native compressor path rather than crashing initialization.

## Representative tests

- `packages/engine/src/Infrastructure/plugins/__tests__/FiltersPlugin.test.ts`
- `packages/engine/src/Infrastructure/plugins/__tests__/SidechainDucker.test.ts`
- `packages/engine/src/Infrastructure/plugins/__tests__/TinyLimiterNode.test.ts`

## Scope boundary

This page covers the plugin implementations themselves. The bus graph and master-output wiring are documented on the bus-system and nodes pages.
