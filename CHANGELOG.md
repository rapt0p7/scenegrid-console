# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Add node inspector for detailed bus and playback states

- Add telemetry for mixer snapshot changes

- Add timeline scrubbing and inspection

- Add dev journal and component map for project overview

- Add test for bus gain collection and fallback

- Add bus snapshotting and manifest dispatch

- Add repomix for documentation updates as hook

- Add delay, probability, and conditional logic to actions

- Add nested event triggering and validation

- Add events manifest to `audioEngine` configuration

- Add quantizable stinger playback

- Add `offsetMode` to transitions and magnets

- Add pre-entry and tail duration to regions

- Add `soundId` and eventmap types to index

- Add event map consistency checks

- Add voice list to profiler and debug panel

- Add voice meter widget to profiler

- Add micro-fade-out to sound instance stop

- Add more assertions to sound controller tests

- Add comprehensive edge case and coverage tests

- Add extensive edge case tests to `ConsistencyChecker`

- Add `moduleDetection`: force to tsconfig

- Add `ITickable` interface and refactor `EngineTicker`

- Add `IRTPCManifest` and `GameParamId` types

- Add consistency check for multiplicative vetoes

- Add readonly to `ConsistencyChecker`

- Add branded `SoundId` type to `SoundRegistry`

- Add branded types for snapshot and layer `IDs`

- Add typed object utility functions

- Add `DeepReadonly` utility type

- Add per-source intensity gain to sidechain ducking

- Add ghost ducking risk validation

- Add method to get default gain of an audio bus

- Add global type declaration for worklet imports

- Add `IEngineTicker` port

- Add jsdoc to shared guards and bus system filter equality

- Add test for cold start audio leak in bus system

- Add scheduling delay for devirtualization

- Add event emitter for released sound instances

- Add test for set of components edge cases

- Add loading spinner and start message to demo

- Add panner configuration to sound instances after rebind

- Add `getCurrentRealGain` to `IAudioBusSystem`

- Add dummy buffer fallback for failed audio loads

- Add `statechange` listener and improve spatial warnings

- Add `loadBatch` for async batch `AudioBuffer` loading

- Add `AudioParameterKeys` utility type

- Add unit tests for `safeDisconnect`, update core tests

- Add `AudioProfiler` for performance metrics and bus visualization

- Add strict validation option to `AudioEngine.init`

- Add routing cycle detection to `ConsistencyChecker`

- Add cooldown mechanism to `play` method

- Add `debug` category to refactoring descriptions

- Add initialization state to optimize transitions

- Add attrubution about ui icons used in debugger

- Add eslint plugin for vitest files

- Add log clearing in audio router test

- Add bages

- Add roadmap

- Add library build scripts and configs

- Add types for bus config and sidechain creation

- Added priority exporting into facade

- Add contributor covenant code of conduct

- Added audio debugger screenshot in readme


### Changed
- Update diagram

- Highlight mixer snapshot changes in logs

- Enhance architecture documentation

- Update diagram

- Update inspector `UI` with new theme and styling

- Implement audio graph visualization

- Expose bus gain and sidechain information

- Use `BroadcastTelemetryTransport` for telemetry

- Update shared layer directory name in contributing guide

- Update contribution guide with new path structure

- Introduce cycle pools for telemetry objects

- Update comment in `AudioBusSystem` test

- Introduce pooled lifecycle events for telemetry

- Improve sound acquisition error handling and telemetry

- Update repomix config for documentation output

- Unify time retrieval for cooldown and telemetry

- Implement telemetry dispatcher and snapshotter

- Update links to architecture documentation

- Update links to architecture documentation

- Update dependencies and vite configs

- Update architecture diagrams and readme for monorepo

- Update tsconfig and vite config for build

- Complete monorepo migration with npm workspaces

- Implement hysteresis for conditions and switch policies

- Extract condition evaluation logic to dedicated evaluator

- Implement bank loading and unloading system

- Update diagram for new file structure and description

- Introduce `IAudioEngine` interface and implement it

- Introduce seeded prng for deterministic variations

- Implement scatterer sound type

- Integrate sequencer and mixer actions into orchestrator

- Update project dependencies

- Update detailed architecture description

- Update diagram for new file structure

- Implement smart loop transition policy and magnets

- Implement event orchestrator and router integration

- Implement switch sound type and validation

- Enhance container sound playback and validation

- Introduce hysteresis for voice culling decisions

- Refactor tests to use standardized-audio-context-mock

- Implement pause/resume logic

- Update system positioning and architecture description

- Update diagram for new file structure

- Implement hot module replacement for audio configuration

- Decouple debug ui initialization and attach logic

- Configure library exports for index and debug

- Update diagram for new file structure

- Expose base bus config and improve snapshot handling

- Improve ducker and limiter processor efficiency

- Introduce panner and filter caching and mutation

- Refactor sound instance routing and sidechain logic

- Introduce routing and gain param to `SoundInstance`

- Introduce zero-allocation node chain with filter pooling

- Update diagram for new file structure

- Refactor tickable entities to implement `ITickable`

- Explain multiplicative veto for gain resolution

- Improve `RTPC` `UI` synchronization and polling

- Bind `RTPC` config to buses on init

- Update diagram for new file structure

- Relocate branded types to shared layer

- Modernize vite config for path resolution

- Introduce instance rtpc binding

- Inject instance rtpc binder into audio router

- Move bus system rtpc to pull model

- Migrate instance rtpc binder to data-oriented polling

- Migrate manager to zero-allocation pull model

- Relocate branded types to shared layer

- Clarify architectural rules and performance invariants

- Update diagram for new file structure

- Use branded type for rtpc game parameters

- Use branded type for region identifiers

- Update diagram for new file structure

- Enhance type safety and decouple router

- Enforce deep immutability for mixer states & snapshots

- Enforce deep readonly and branded busids

- Use branded types and remove async from `clearLayer`

- Use branded types for layer and bus ids

- Make `MixerCoordinator` methods synchronous

- Improve filter handling and config immutability

- Cast snapshots to `ISnapshots` interface

- Simplify sequencer state management and scheduling

- Extract handler creation in `InstanceRTPCBinder`

- Use `isDefined` guard for sources check

- Use private readonly for constructor params

- Use explicit guards and mutable options for variation

- Improve rtpc curve evaluation logic

- Make domain and kernel ports readonly

- Disable restricted imports for infrastructure

- Update oxlint rules

- Migrate to oxlint and oxfmt for linting and formatting

- Update markdown styling in docs and readme

- Update diagram for new file structure

- Decouple container playback logic from state management

- Update core system architecture and terminology

- Align consistency checker test with domain payload

- Update diagram for new file structure

- Implement virtual voice auto-end and preserve sidechains

- Update diagram for new file structure

- Rename mixer state manager to transition engine

- Update rtpc curves in vertical layering example

- Update rtpc panel for new rtpc manager api

- Rename manager to sequencer and use ticker

- Use named constants for automation engine

- Update diagram for new file structure

- Update dependency cruiser config

- Adjust start times in `SoundInstance` tests

- Change repomix output style to xml

- Introduce engine ticker for scheduling and orchestration

- Improve mixer state transition logic

- Update `AudioRouter` tests for new `BusSystem`

- Use `analyzerTapNode` for bus analysis

- Refactor `AudioBus`

- Integrate audio bus system with engine ticker

- Replace raf with engine ticker for automation batching

- Decouple tick processing from interval in `RTPCManager`

- Introduce `EngineTicker` for scheduled tasks

- Update import path for `ISoundController`

- Refactor sidechain and routing in `AudioBusSystem`

- Migrate from webpack to vite for library and demo builds

- Update diagram for new file structure

- Expose debug pools and layer stack

- Use branded types for sound registry

- Extract variation application to dedicated resolver

- Introduce `CullingContextProvider` for context injection

- Centralize mime type mapping in `AudioBufferLoader`

- Update dependency graph with new modular structure

- Optimize `Scheduler` with slot-based approach

- Rename processors and reorganize paths

- Split `VoiceCullingSystem` into domain and infa parts

- Implement zero-allocation and fix virtualization

- Update `AudioDebugger` screenshot

- Reuse curve buffers to reduce memory allocation

- Reorganize visualizers and related infrastructure

- Update contributing.md with hexagonal architecture details

- Align commit scopes with updated hexagonal architecture

- Update architecture and signal flow documentation

- Apply branded types, fix imports, resolve circular deps

- Update eslint and dependency-cruiser architecture rules

- Isolate domain from web audio infrastructure

- Reorganize project into hexagonal structure

- Optimize parameter management with indexed arrays

- Expand roadmap with new phases and features

- Move dsp adapters from core to webaudio-core

- Update depenedncy graph

- Enhance `AudioEngine` demo with event-driven lifecycle

- Integrate comprehensive event system across `AudioEngine`

- Introduce `EngineEventDispatcher` and event typings

- Improve `UnlockManager` unlock logic and tests

- Centralize null/undefined checks with guards

- Enhance typing and consistency

- Replace `update` method with `coldStart`

- Update `TypeScript` badge to v6.0

- Migrate to `TypeScript` 6.0 and `ESM` imports

- Move `architecture` directory into docs

- Update conventional commit with expanded scopes and descriptions

- Update dependencies in `package-lock.json`

- Update depenedncy graph

- Update coverage badge to reflect 97% coverage

- Update and refine documentation with extended feature descriptions

- Improve `ConsistencyChecker` with enhanced `RTPC` validation

- Integrate `RTPCManifest` into `AudioEngine` with initialization support

- Enhance `RTPC` handling with presets, interpolation, and tests

- Update audio graph scheme with clipper node

- Update audio graph scheme with clipper node

- Enhance `SidechainDucker` with clipping, improved graph restoration

- Improve `createSidechain` lifecycle management

- Optimize parameter updates with batched event emission

- Replace `push` with `setState` for snapshot activation

- Replace `push` with `setState` and simplify bus snapshots

- Unify parameter updates and optimize rtpc handling

- Introduce explicit mixer state and modifier api

- Implement gain multiplication and clamping

- Update roadmap

- Update dependency graph

- Unify sound configs and improve unconfigured sound handling

- Update phase 2 of roadmap

- Update snapshots interface

- Move code of conduct to .github folder

- Update readme init section

- Move contributing to .github folder

- Update dependency graph

- Centralize manager interfaces and enums

- Set up api documentation generation

- Disable naming-convention rule

- Update audio engine configuration types

- Update audited dependencies

- Update gitattributes, add all sounds to LFS

- Added husky pre-commit and commit-msg

- Added diagrams into description

- Initial commit with WebAudio engine setup


### Fixed
- Adjust `CullingRunner` and telemetry bus data expectations

- Adjust html doctype declaration and add favicon link

- Use modulo for accumulator reset in `EngineTicker`

- Replace container manager with policy and history registry

- Fix formatting

- Improve stop and cancel for virtual/paused instances

- Improve sidechain ducker disconnection and lifecycle

- Use bus default gain for gains during transition

- Update unit tests for mixer and sequencer

- Adjust start and stop 'when' parameter handling

- Improve resilience of `AudioBufferLoader` tests

- Fix import order in `SidechainDucker.ts` for clarity

- Update mixer tests to reflect `addModifier` and `removeModifier` api

- Update tests to align with `updateSend` arguments and rtpc logic

- Fix audio debugger tests after removing optional analyzer

- Fix audio debugger test after optional analyzer delete

- Fix all linter errors in all test files

- Fix tests after audio router interface update

- Fix tests after sidechain creation and config updates

- Update consistency checker for cheching bus config

- Automate sidechain creation via bus config

- Fix audio engine and smart loop tests after interfaces update

- Fix audio engine tests after interfaces update


### Removed
- Remove redundant `IAudioWorkletProcessor` interface

- Remove unused `connectNodeToBus` method

- Remove unused `busSystem` dependency from `AudioRouter`

- Remove .babelrc configuration

- Remove `hasPanner` property from `SoundDescriptor`

- Remove redundant recompute call in snapshot manager tests

- Remove timer logic from `CullingRunner`

- Remove promise from snapshot activation and recompute

- Remove unused webpack configurations

- Remove unused properties from snapshot example

- Remove local `clamp` helper and centralize in `@webaudio-core`

- Remove sidechain references from tests

- Remove sidechain property and update transition logic

- Remove audiomotion-analyzer



