---
type: domain subsystem
title: Router and Playback Managers
description: Runtime routing and playback decision logic that selects concrete sounds, applies culling and playback policies, and wires ducking and RTPC state onto active voices.
tags: [engine, routing, playback, rtpc, culling]
sources:
  - id: openwiki-source-083b4fd36ef6321d38f433cb
    resource: repo://packages/engine/src/Domain/Culling/VoiceCullingArbiter.ts
  - id: openwiki-source-645509fdb5d3870d9ac70b8f
    resource: repo://packages/engine/src/Domain/Managers/__tests__/DuckingManager.test.ts
  - id: openwiki-source-29871fa711f4c20ce39ea39f
    resource: repo://packages/engine/src/Domain/Managers/ContainerPlaybackPolicy.ts
  - id: openwiki-source-6c5afecf9e0fea787b6e9572
    resource: repo://packages/engine/src/Domain/Managers/DuckingManager.ts
  - id: openwiki-source-e291a117b7638934726af55e
    resource: repo://packages/engine/src/Domain/Managers/InstanceRTPCBinder.ts
  - id: openwiki-source-8ee1d1837612eddd9ae2401b
    resource: repo://packages/engine/src/Domain/Managers/SwitchPlaybackPolicy.ts
  - id: openwiki-source-54b2ffb598d3f44d12fe95b0
    resource: repo://packages/engine/src/Domain/Router/__tests__/AudioRouter.test.ts
  - id: openwiki-source-3d79432ddad3aec66a1b7c28
    resource: repo://packages/engine/src/Domain/Router/AudioRouter.ts
  - id: openwiki-source-5effbca300242106581a320c
    resource: repo://packages/engine/src/Domain/Router/VariationResolver.ts
  - id: openwiki-source-9445fc6390157ea6fbf89248
    resource: repo://packages/engine/src/Infrastructure/loader/BankManagerAdapter.ts
generated: { by: "openwiki/0.5.0", at: "2026-09-03T11:15:32.736Z" }
verified:
  - by: openwiki/0.5.1
    at: 2026-09-25T08:14:31.202Z
---

# Router and Playback Managers

This subsystem is the runtime decision layer between authored sound configuration and concrete playback.
It does not own config authoring or low-level sound transport; instead it resolves what should play, what should be vetoed, and which playback-side effects must be attached after selection.

## Runtime role

The router and its managers sit in the middle of the engine's domain graph:
configuration describes candidate sounds, state registries remember prior selections, and the sound controller executes the final play or stop operations.
That means this layer is stateful even when it looks like a pure selector: container history, switch history, active playbacks, and current RTPC values all influence the next decision.

```mermaid
flowchart TD
    Config["Sound config"] --> Router["AudioRouter"]
    Router --> Var["VariationResolver"]
    Router --> Cont["ContainerPlaybackPolicy"]
    Router --> Switch["SwitchPlaybackPolicy"]
    Router --> Duck["DuckingManager"]
    Router --> Bind["InstanceRTPCBinder"]
    Router --> Culling["VoiceCullingArbiter"]
    Cont --> Hist1["Container history registry"]
    Switch --> Hist2["Switch history registry"]
    Switch --> RTPC["RTPC adapter"]
    Bind --> Voice["Active voice lifecycle"]
    Duck --> Bus["Sidechain bus triggers"]
    Culling --> Voice
    Router --> SC["Sound controller"]
```
Caption: runtime routing fans out from `AudioRouter` into selection, side effects, and voice-management helpers.

## Owned modules

- `AudioRouter`
- `VariationResolver`
- `ContainerPlaybackPolicy`
- `SwitchPlaybackPolicy`
- `DuckingManager`
- `InstanceRTPCBinder`
- `VoiceCullingArbiter`

## Responsibilities

- resolve a `SoundId` into one or more concrete playback ids or reject it when the registry cannot supply a valid entry;
- choose container sources using policy plus history so repeated plays can avoid or repeat candidates according to mode;
- select switch targets from numeric thresholds or localized overrides, then persist the resolved switch state;
- apply per-playback variation, ducking, RTPC binding, and bus routing after the target is selected;
- keep voice culling separate from route resolution while still allowing bus pressure and voice state to suppress or restore playback.

## Routing flow and veto paths

`AudioRouter.play()` is the main entrypoint.
It first validates that the requested sound exists in the sound map, and it refuses to play missing ids rather than inventing a fallback.
The router then branches by authored sound shape:

- containers delegate to `ContainerPlaybackPolicy` and update container history;
- layered sounds expand into multiple child playbacks;
- switch sounds resolve through `SwitchPlaybackPolicy` using the current RTPC value or a localized override plus switch history;
- scatterers are handed to the scatterer orchestrator, and if that orchestrator is unavailable the router returns `null` and reports the failure;
- ordinary sounds run through `VariationResolver` before being scheduled on the sound controller.

The tests show that these veto paths are not theoretical:
missing config yields a no-op, scatterer playback is blocked until the orchestrator exists, switch resolution can return `null` without falling back to an arbitrary asset, and recursion depth is capped so cyclic container definitions cannot loop forever.

```mermaid
sequenceDiagram
    participant App as Call site
    participant Router as AudioRouter
    participant Hist as History registry
    participant RTPC as RTPC adapter
    participant Policy as Playback policy
    participant SC as Sound controller

    App->>Router: play(soundId)
    Router->>Router: look up config
    alt missing config
        Router-->>App: null
    else container
        Router->>Hist: read previous selection
        Router->>Policy: evaluateNext(config, state)
        Policy-->>Router: selected source and next state
        Router->>Hist: store next state
        Router->>SC: play(selected source)
    else switch
        Router->>Hist: read switch history
        Router->>RTPC: read current value or override
        Router->>Policy: evaluateNext(config, value, state)
        Policy-->>Router: selected source or null
        alt policy returned null
            Router-->>App: null
        else selected source
            Router->>Hist: store next state
            Router->>SC: play(selected source)
        end
    end
```
Caption: routing depends on history and current state, and it can fail closed when selection cannot be resolved.

## Selection policies

`ContainerPlaybackPolicy` is responsible for choosing the next source inside a container, not for starting playback itself.
It supports three modes:

- `sequence`, which advances by index and wraps around;
- `random`, which uses weighted random selection;
- `random_no_repeat`, which keeps resampling until the selected index is not in the recent-history window.

The policy also returns the next container state, which is why the router can persist history after selection and make the next play depend on the previous one.
If a container has no sources, the policy returns `soundId: null` and resets the state to `lastPlayedIndex: -1`.

`SwitchPlaybackPolicy` follows a similar pattern for switch-based routing.
Numeric values select the highest configured threshold at or below the current value, string values act as explicit keys, and the configured default switch is only used when the selected key has no explicit mapping.
Hysteresis makes the policy history-sensitive: if the current value sits near a boundary, the policy can preserve the previous switch key instead of flipping immediately.
That matters because the router persists the returned state back into the switch registry, so future evaluations can see the prior key.

## Variation and playback wiring

`VariationResolver` is a pure option transformer.
It does not choose the target sound, but it can perturb rate, volume, and seek offset when the source config carries variation settings.
The router applies the resolver before delegating to `SoundController.play()`, which means runtime variation is part of the play request and not an afterthought.

After a playback is created, `AudioRouter.applyConfigToPlayback()` performs the post-selection wiring that the controller itself does not infer from the sound id alone:

- route the voice to a bus when the config declares `busId`;
- trigger ducking against one or more target buses when the config carries ducking metadata;
- bind RTPC targets so voice parameters track game-parameter changes over time.

This division keeps selection policy separate from side effects while still ensuring that one play request can fan out into routing, ducking, and parameter binding.

## Ducking, RTPC binding, and lifecycle cleanup

`DuckingManager` is a thin sidechain trigger adapter.
It converts a single bus or a bus list into `addSidechainTrigger()` calls on the sound controller, and it falls back to intensity `1` when the intensity list is shorter than the bus list.
That makes ducking a configurable post-selection effect rather than a special case in the router.

`InstanceRTPCBinder` manages per-voice RTPC bindings.
It accepts a config map for supported voice targets, creates active bindings, applies the mapped parameter value immediately, and re-applies them later in `tickRTPC()`.
It also registers an `onVoiceEnded()` cleanup hook so bindings are removed when the voice dies, which prevents stale instance state from accumulating across playback lifecycles.

`VoiceCullingArbiter` watches active playbacks against bus volume and physical state.
When a bus stays below the culling threshold long enough, it marks voices for virtualization after the hysteresis window; when the bus becomes audible again, it marks virtual voices for devirtualization if their logical state is still playing.
Ghost voices are skipped, and playbacks that disappear from the active list are removed from the mute timer map.
The arbiter therefore acts as a pressure-management gate around the router's output, not as part of sound selection itself.

## Important invariants and failure behavior

- Missing sound ids are rejected early, so the router does not synthesize fallback content.
- Container and switch selection depend on history registries, so replay behavior is intentionally stateful.
- Switch selection can legitimately return `null`, and the router treats that as a non-play result instead of forcing a default asset.
- Recursion depth is capped to prevent self-referential container graphs from looping forever.
- Ducking and RTPC binding only happen after a concrete playback target exists.
- Culling decisions depend on active playback state and bus volume, which means voice management is reactive to runtime pressure rather than static config alone.

## Extension points and operations

- Add a new routing shape by extending `AudioRouter.play()` and preserving the existing fail-closed behavior for missing or unresolved configs.
- Add new container behavior by extending `ContainerPlaybackPolicy` while continuing to return both the selected source and the next history state.
- Add new switch behavior by extending `SwitchPlaybackPolicy` and keeping the registry-backed state update path intact.
- Add new post-selection side effects by expanding `AudioRouter.applyConfigToPlayback()` rather than mixing those effects into selection policy.
- Tune culling behavior by adjusting the threshold, hysteresis, or pool size in `VoiceCullingArbiter` without changing the router's selection logic.

## Representative tests

Focused tests document the behaviors that matter most here:

- `packages/engine/src/Domain/Router/__tests__/AudioRouter.test.ts`
- `packages/engine/src/Domain/Managers/__tests__/DuckingManager.test.ts`

Those tests cover missing-config vetoes, switch fallbacks and null results, recursive container protection, tail playback behavior, multi-bus ducking, and the post-selection wiring that ties the router to the sound controller.
