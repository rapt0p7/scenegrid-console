# @scene-grid/engine

> High-performance AudioWorklet-based runtime engine for SceneGrid

[![npm version](https://badge.fury.io/js/@scene-grid%2Fengine.svg)](https://badge.fury.io/js/@scene-grid%2Fengine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`@scene-grid/engine` is the core runtime package that orchestrates complex signal routing, polyphony culling, and deterministic parameter control through a high-performance, AudioWorklet-based engine. It transforms static audio configurations into live playback while guaranteeing zero Garbage Collection (GC) overhead at runtime.

## Installation

```bash
npm install @scene-grid/engine
```
*Note: This package requires `standardized-audio-context` as a peer dependency to normalize browser discrepancies.*

## Quick Start

The engine uses TypeScript Declaration Merging (`declare module`) to provide 100% type safety for your custom audio IDs, events, and parameters. The configuration itself is typically generated ahead of time by `@scene-grid/cli`.

```typescript
import { AudioEngine } from '@scene-grid/engine';

// 1. Import your CLI-generated configurations
import {
    Buses,
    Snapshots,
    SoundMap,
    RTPCManifest,
    Events,
    BankManifest,
    MusicFSM,
    AudioSizes,
    SoundManifest
} from './audio-config/index.js';

// 2. Augment the engine registry for strict autocomplete
declare module '@scene-grid/engine' {
    export interface SceneGridRegistry {
        SoundIds: keyof typeof SoundMap;
        EventIds: keyof typeof Events;
        BankIds: keyof typeof BankManifest;
        SnapshotIds: keyof typeof Snapshots;
        GameParamIds: keyof typeof RTPCManifest;
    }
}

// 3. Instantiate the engine
const audio = new AudioEngine({
    manifest: SoundManifest,
    buses: Buses,
    snapshots: Snapshots,
    soundMap: SoundMap,
    rtpcManifest: RTPCManifest,
    events: Events,
    banks: BankManifest,
    musicFSM: MusicFSM,
    precalculatedSizes: AudioSizes,
    ramQuotaMb: 128, // Strict RAM ceiling
    globalVoiceLimit: 32, // Pre-allocated physical voices
    remoteSyncUri: 'ws://localhost:8081' // Connects to Inspector UI
});

// 4. Initialize and run consistency checks
await audio.init({ isStrictValidation: false });

// 5. Explicitly load required asset banks into memory
await audio.banks.load('sfx');
await audio.streams.load('backgroundMain');

// 6. Unlock the Web Audio API context within a user gesture!
document.addEventListener('pointerup', async () => {
    await audio.unlock();

    // 7. Play sounds directly or trigger events
    audio.play('backgroundMain', { isLoop: true });
    audio.postEvent('start_combat_music');
}, { once: true });
```

## Architecture & Data Flow

The engine strictly enforces a unidirectional, acyclic signal path:

1. **Intake & Validation**: During `await audio.init()`, the `ConsistencyChecker` verifies routing safety, preventing loops (e.g., Bus A -> Bus B -> Bus A). By default, it logs warnings, but with `{ isStrictValidation: true }`, initialization safely aborts upon detecting errors.
2. **Asset Loading**: Assets are not loaded automatically. You must explicitly load pre-packaged banks (`audio.banks.load()`) or individual streams (`audio.streams.load()`).
3. **Execution Context**: The engine remains muted until `await audio.unlock()` is called in response to a user interaction, satisfying modern browser Auto-Play policies.
4. **Zero-GC Voice Allocation**: `SoundPoolManager` pre-allocates exactly `globalVoiceLimit` instances of physical voices at startup. When polyphony exceeds this, it employs a `steal_oldest` policy based on priority to swap inactive voices without dynamically allocating new JavaScript objects.
5. **DSP Routing**: The finalized graph is processed via an isolated `AudioWorklet` and piped to the `AudioDestination`.

## License
MIT © Igor Zabrodin
