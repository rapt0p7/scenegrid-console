# SceneGrid: Audio Observability & Runtime Platform

[![npm engine](https://img.shields.io/npm/v/@scene-grid/engine.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@scene-grid/engine)
[![npm inspector](https://img.shields.io/npm/v/@scene-grid/inspector.svg?style=flat-square&color=007acc)](https://www.npmjs.com/package/@scene-grid/inspector)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tested with Vitest](https://img.shields.io/badge/tested_with-Vitest-729B1B.svg?style=flat-square&logo=vitest)](https://vitest.dev/)
[![Coverage](https://img.shields.io/badge/coverage-99%25-brightgreen.svg?style=flat-square)](https://github.com/rapt0p7/scenegrid-console)
[![Mutation Score](https://img.shields.io/badge/Mutation_Score-92%25-brightgreen)](https://stryker-mutator.io)
[![Powered by Oxlint](https://img.shields.io/badge/powered%20by-Oxlint-blue)](https://oxc.rs)
[![Formatted with Oxfmt](https://img.shields.io/badge/formatted%20with-Oxfmt-blue)](https://oxc.rs)
[![License: PolyForm](https://img.shields.io/badge/License-PolyForm%20Noncommercial-purple.svg?style=flat-square)](./LICENSE.md)
[![Web Audio API](https://img.shields.io/badge/Web_Audio-API-ffb244.svg?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

> **Understand your audio system before it plays.**
> _Independent research project started ~mid 2025._

**SceneGrid** is an observability-first simulation, debugging, and execution platform for real-time Web Audio. Built with a strict Hexagonal Architecture and Zero-Allocation memory management, it is designed for complex, state-driven applications (games, interactive web environments) where audio predictability and FPS stability are mission-critical.

Conceptually, the system bridges the gap between:

- **A System-Level Debugger:** Causal tracing, state simulation, and visual observability.
- **A Runtime Engine:** High-performance, GC-safe audio execution.
- **Hardware Consoles:** Total recall capabilities via snapshots and multi-layered mix states.

---

## ⚡ Is SceneGrid right for you? (Alternatives)

SceneGrid is an **Enterprise-grade** tool designed to solve complex routing, polyphony culling, and memory-leak issues in massive projects.

- If you are building a lightweight promo site, an indie Match-3 game, or just need to play a few sound effects quickly with a great Developer Experience, **you probably don't need SceneGrid.** We highly recommend checking out [zvuk](https://github.com/schmooky/zvuk) or [Howler.js](https://howlerjs.com/) for excellent, lightweight plug-and-play solutions.
- If you are building a **heavy 60-FPS game, a complex WebGL experience, or a multi-state interactive app** where Garbage Collection spikes cause visual stuttering, and you need a visual debugger to understand _why_ a specific sound was ducked or culled—**SceneGrid is built for you.**

---

## 📦 Monorepo Packages

SceneGrid is structured as a monorepo to enforce strict architectural boundaries between the runtime engine and developer tooling:

- **`@scene-grid/engine`**: The core zero-allocation audio runtime and domain logic.
- **`@scene-grid/inspector`**: A fully decoupled, drop-in visual debugger and profiler UI.
- **`@scene-grid/shared`**: High-performance math kernels, randomizers, and shared domain types.

---

## 📚 Documentation & Architecture Diagrams

For a deep dive into the system's topology, including **C4 Container Diagrams** and the complete **Audio Signal Flow**, please refer to the detailed documentation:

- 🇬🇧 [Audio System Architecture - English](./docs/ARCHITECTURE.md)
- 🇷🇺 [Архитектура Аудио Системы - Русский](./docs/ARCHITECTURE[RU].md)

---

## 1. System Architecture & Observability

Audio systems usually fail not because playback is hard, but because system behavior is opaque. SceneGrid enforces a strict hierarchical flow to ensure phase coherence, predictable routing, and deep observability. No bypass routes are permitted.

### The Core Hierarchy

**Source (Voice) → Individual Channel (NodeChain) → Group Bus → Master Output**

- **Zero-Allocation Object Pools:** Each sound is fully isolated with its own local processing chain. Voices are managed via a Free-list stack, ensuring `O(1)` access time and **eliminating Garbage Collection (GC) spikes** during heavy gameplay.
- **Deterministic Voice Culling:** The `PlaybackScheduler` and `VoiceCullingArbiter` monitor active voice limits. Low-priority sounds are transparently virtualized (computed in the background without AudioNodes), maintaining strict FPS stability.
- **Data-Driven Buses:** Function as group channels with a fixed channel strip structure. Routing is immutable, preventing uncontrolled summing and making the entire audio graph visually traceable.

### Master Section

The single exit point to the hardware destination includes:

- A master fader and **Brickwall Limiter** (`TinyLimiterNode`).
- **`silentTail`:** A zero-volume output branch that keeps DSP processors active without leaking internal "trigger" audio into the final mix.

---

## 2. Advanced Audio Mechanics

### Lookahead Sidechain Ducking

Powered by a custom `AudioWorklet`, the system supports predictive ducking with cascade protection—running entirely on the audio thread, not the main UI thread.

1. **Hard Clipping Protection:** A `WaveShaperNode` safely clamps overlapping triggers.
2. **Predictive Attenuation:** A `DelayNode` is inserted into the target bus, allowing the gain to drop _before_ the trigger peak for a pop-free, professional attack.

### Total Recall (VCA-Style Snapshots)

The system supports **Total Recall** using a VCA (Voltage-Controlled Amplifier) multiplication model.

- Mix states can be safely layered (e.g., a "Combat Layer" atop an "Explore Layer").
- The `MixerTransitionEngine` calculates final values, automatically handling "cold starts" with zero-latency protection to prevent audio bursts.

### Deterministic Parameter Control (RTPC)

A virtual patchbay connecting game data to audio parameters, driven by a centralized `EngineTicker` to protect the main rendering thread from high-frequency `AudioParam` spamming.

- **Global Slew Rates:** Designers define FPS-independent inertia (`attackMs` / `releaseMs`) ensuring predictable transitions regardless of frame drops.
- **Advanced Math Kernels:** Built-in evaluators for `s-curve`, `logarithmic`, and custom Piecewise Linear mappings.

### Predictable Parallel Routing (Auxiliary Sends)

Parallel routing allows for shared effects without breaking graph observability. Tapping occurs strictly **Post-Filter** to ensure processed audio is sent to the FX chain, significantly reducing CPU overhead while maintaining a clear, acyclic signal path.

---

## 3. Deterministic Orchestration

### Horizontal Sequencing

Instead of chaotic, scattered trigger calls across your game code, SceneGrid uses a strict, dedicated `Sequencer` for horizontal music transitions.

- **Audio Sprites & Quantization:** Seamlessly loops regions within a single file and syncs transitions to a musical grid (BPM/Bar).
- **Separation of Concerns:** Horizontal sequencing (when a section plays) is entirely decoupled from vertical intensity (volume/layers driven by Snapshots and RTPC). This strict separation allows DevTools to accurately predict, trace, and visualize the mix state without hidden side effects.

---

## 🎛️ Audio Debugger & Visualizer (DevTools MVP)

Because SceneGrid separates Domain Logic from Web Audio Infrastructure, the visual tools are provided as a completely independent package: **`@scene-grid/inspector`**.

Act as a true audio engineer: monitor Bus levels, RMS envelopes, and Spectrum Analysis to ensure your mix stays out of the red, and trace exactly why a specific snapshot or RTPC curve is affecting your audio—all without adding a single byte to your production runtime bundle.

---

## 🚀 Roadmap: Towards a Complete Observability Ecosystem

_Note: Core stability and Parameter Resolution Pipeline are part of the v1.0 milestone. The following roadmap outlines the evolution of the engine towards a full Audio Observability Platform._

### 🔴 Phase 1: Observability & "Hot Swap" DX (v1.1)

- ✅ **In-Game Inspector 2.0 (SceneGrid DevTools):** Enhancing the current `@scene-grid/inspector` into a deep interactive overlay. Developers can visually trace voice culling decisions, tweak RTPCs, test snapshots, and adjust bus gains in real-time over the game canvas.
- ✅ **Anti-Flutter Voice Culling (Hysteresis):** Adding a time buffer to the virtualization logic to prevent rapid fade-in/fade-out ("flutter") during stress tests, keeping the debug trace clean.
- ✅ **Event-Driven State Machine:** Moving beyond `play(sound)`. Exposing autonomous behaviors (`onPlay`, `onStop`, tails) so DevTools can track the entire lifecycle of an audio entity.
- ✅ **Hot Swap Architecture:** Soft-reloading of JSON configurations via state diffing without page reloads.

### 🟡 Phase 2: Telemetry & Live Bridge (v1.2)

- **Remote Sync Adapter (The Live Bridge):** An infrastructure module powered by WebSockets. Allows a running `AudioEngine` to act as a client, broadcasting telemetry and receiving live property updates from external authoring tools.
- **SceneGrid CLI Bridge:** A Node.js utility that monitors your local workspace and pushes changes directly into your running game instance.
- **Semantic Music States:** Logic-based states (e.g., _Exploration_ → _Combat_) where the engine automatically resolves loop regions and layers, providing a single source of truth for the debugger.
- **Internal Modulators:** Native LFOs and Envelopes for continuous parameter modulation, decoupling audio animation from the game engine's main ticker for maximum stability.

### 🟢 Phase 3: SceneGrid Studio & Environments (v2.0)

- **SceneGrid Studio (Standalone Web App):** A fully decoupled, visual authoring and simulation tool. Build routing graphs, draw RTPC curves, and simulate mix states offline. Changes are pushed instantly to your running game via the Live Bridge.
- **Environment System:** Logic-based Reverb Zones and Acoustic States utilizing the existing Aux Sends.
- **Dattorro Reverb Integration:** Implementing high-quality, algorithmic plate reverb natively as the standard FX Bus plugin for Environment simulation.

---

## 🏗️ Architecture: The Hexagonal Approach

The system is built using **Hexagonal Architecture (Ports & Adapters)**, ensuring that the core reasoning logic remains independent of the Web Audio API. This allows SceneGrid to run simulations and evaluate mixer states mathematically without requiring active audio playback.

| Layer              | Responsibility      | Content                                                           |
| ------------------ | ------------------- | ----------------------------------------------------------------- |
| **Domain**         | Pure Business Logic | Mixer state, Routing logic, Culling rules, Port definitions.      |
| **Infrastructure** | Technical Adapters  | Web Audio Node implementations, Worklet processors, File loading. |
| **Application**    | Orchestration       | System bootstrapping, high-level API Facades (`AudioEngine`).     |
| **Kernel**         | Math & Performance  | RTPC modulation engine, curve evaluation, high-speed math.        |
| **Shared**         | Cross-cutting       | Mathematical constants, shared types, and universal guards.       |

---

## Quick Start: System Initialization

The system follows a **Data-Driven** pattern. Defining assets and routing upfront is what enables SceneGrid to validate the signal graph, trace errors, and prevent routing loops before any sound is even triggered.

```typescript
import { AudioEngine, BankId } from '@scene-grid/engine';
// Import the decoupled debugger in development mode
import { AudioDebugger } from '@scene-grid/inspector';

// Configuration manifests (Data-Driven Graph)
import { Buses, Snapshots, SoundMap, RTPCManifest, Events, BankManifest } from './audio-config';
import soundManifest from './soundManifest';

async function bootstrap() {
    // 1. Instantiate the Engine with a centralized configuration
    const audio = new AudioEngine({
        manifest: soundManifest,
        buses: Buses,
        snapshots: Snapshots,
        soundMap: SoundMap,
        rtpcManifest: RTPCManifest,
        events: Events,
        banks: BankManifest,
        globalVoiceLimit: 32 // Critical for Culling & GC Safety
    });

    // 2. Optional: Attach the Inspector (automatically excluded in Prod builds)
    if (process.env.NODE_ENV !== 'production') {
        const inspector = new AudioDebugger(audio);
        inspector.mount(document.body);
    }

    // 3. Subscribe to Lifecycle Events (Decoupled from UI)
    audio.events.on('load:progress', ({ progress, lastLoadedResource }) => {
        console.log(`[Demo UI] Loading Audio: ${Math.round(progress * 100)}%`);
    });

    // 4. Initialize Engine
    await audio.init({ isStrictValidation: false });

    // 5. Download assets with auto codec-laddering
    await audio.banks.load('music' as BankId);

    // 6. Browser Security: Unlock AudioContext via User Interaction
    globalThis.addEventListener(
        'pointerup',
        async () => {
            await audio.unlock();
            await audio.mixer.setState('idle');

            audio.play('backgroundMusic', { isLoop: true });
        },
        { once: true }
    );
}

bootstrap().catch(console.error);
```

---

## License

Copyright © 2025-2026 Igor Zabrodin.
Licensed under the **PolyForm Noncommercial License 1.0.0**. See the `LICENSE.md` file for details.

---

