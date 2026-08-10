---
type: architecture overview
title: Repository architecture overview
description: Cross-package map of the engine, inspector, shared contracts, and example runtime, with the runtime and dependency flow between them.
tags: [architecture, monorepo, runtime]
---

# Repository architecture overview

The repository is a monorepo with three published packages and one example runtime workspace.

## Package roles

- `@scene-grid/engine` owns the audio runtime and browser audio adapters.
- `@scene-grid/inspector` owns the browser debugger and control overlay.
- `@scene-grid/shared` owns the common contracts, math, and worker bridge.
- `examples` shows how to compose engine and inspector in a browser app.

## Dependency flow

- shared sits at the bottom of the package graph;
- engine depends on shared;
- inspector depends on engine and shared;
- examples depends on engine and imports inspector dynamically in development.

```mermaid
flowchart LR
    shared[@scene-grid/shared]
    engine[@scene-grid/engine]
    inspector[@scene-grid/inspector]
    examples[examples runtime]

    shared --> engine
    shared --> inspector
    engine --> inspector
    engine --> examples
    inspector --> examples
```

## Runtime composition

The main runtime path is:

1. the example app builds `AudioEngine` with authored manifests;
2. the engine validates configuration, creates audio context and infrastructure, and exposes runtime facades;
3. the example app unlocks the audio context on user gesture and starts playback;
4. in development, the example app dynamically imports the inspector and mounts the debug overlay.

## Build and validation surfaces

- root scripts orchestrate workspace builds, linting, formatting, and test execution;
- each package has its own build script and exported entry surface;
- representative tests are clustered by package and subsystem, so validation is usually narrower than a full workspace run.

## Relationship to the rest of the wiki

- See [Engine package overview](../engine/overview.md) for the runtime package map.
- See [Inspector package overview](../inspector/overview.md) for the debug UI package map.
- See [Shared package contract](../shared/index.md) for the shared export surface.
- See [Example app runtime](../examples/runtime.md) for the repository’s top-level integration flow.
