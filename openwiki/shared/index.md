---
type: shared contract
title: Shared package contract
description: Canonical placeholder for the `@scene-grid/shared` package surface. The current wiki tree does not yet contain a detailed shared-package page, so this file serves as the package boundary anchor.
tags: [shared, package, contract]
---

# Shared package contract

This page is the boundary anchor for `@scene-grid/shared`.

The repository wiki currently exposes the shared package only as a package-level placeholder. Use this page as the navigation target for the common contracts, math helpers, memory utilities, and worker bridge that other packages import from shared.

## What belongs here

- shared types and guards used by engine and inspector;
- math helpers such as RTPC curve evaluation;
- concurrency and memory helpers;
- telemetry or worker-bridge primitives that are reused across packages.

## Relationship to the rest of the wiki

- See [Repository architecture overview](../architecture/overview.md) for the package graph.
- See [Engine package overview](../engine/overview.md) for downstream engine usage.
- See [Inspector package overview](../inspector/overview.md) for downstream inspector usage.
- See [Example app runtime](../examples/runtime.md) for the main consumer flow.
