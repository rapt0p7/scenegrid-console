# SceneGrid: Audio Observability & Runtime Platform

[![CI Checks](https://github.com/rapt0p7/scenegrid-console/actions/workflows/ci.yml/badge.svg)](https://github.com/rapt0p7/scenegrid-console/actions/workflows/ci.yml)
[![Publish to NPM](https://github.com/rapt0p7/scenegrid-console/actions/workflows/publish.yml/badge.svg)](https://github.com/rapt0p7/scenegrid-console/actions/workflows/publish.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Web Audio API](https://img.shields.io/badge/Web_Audio-API-ffb244.svg?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Tested with Vitest](https://img.shields.io/badge/tested_with-Vitest-729B1B.svg?style=flat-square&logo=vitest)](https://vitest.dev/)
[![Mutation Score](https://img.shields.io/badge/Mutation_Score-92%25-brightgreen)](https://stryker-mutator.io)
[![codecov](https://codecov.io/gh/rapt0p7/scenegrid-console/graph/badge.svg?token=3KQ9G3APV4)](https://codecov.io/gh/rapt0p7/scenegrid-console)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/0810c1db16c74c96b41c5e4008c5ee43)](https://app.codacy.com/gh/rapt0p7/scenegrid-console/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![Code health](https://api.repowise.dev/badge/health/rapt0p7/scenegrid-console.svg)](https://repowise.dev/repo/rapt0p7/scenegrid-console)
[![repowise](https://api.repowise.dev/badge/wiki/rapt0p7/scenegrid-console.svg)](https://repowise.dev/repo/rapt0p7/scenegrid-console)
![specs](https://raw.githubusercontent.com/rapt0p7/scenegrid-console/gh-pages/badges/number_of_specs.svg)
![requirements](https://raw.githubusercontent.com/rapt0p7/scenegrid-console/gh-pages/badges/number_of_requirements.svg)
[![Keep the Why](https://keepthewhy.com/assets/badge.svg)](https://keepthewhy.com)
[![Powered by Oxlint](https://img.shields.io/badge/powered%20by-Oxlint-blue)](https://oxc.rs)
[![Formatted with Oxfmt](https://img.shields.io/badge/formatted%20with-Oxfmt-blue)](https://oxc.rs)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
> **Understand your audio system before it plays.**
> _Independent research project started ~mid 2025._

**SceneGrid** is an advanced runtime audio engine for the web, designed to bridge the gap between AAA desktop game engines and browser-based experiences. It acts as an **audio middleware** (conceptually similar to FMOD or Wwise), allowing teams to build complex, data-driven audio behaviors without writing scattered trigger code.

**What problem does it solve?** Modern web games lack the mature, data-driven audio middleware that PC and Console developers take for granted. SceneGrid eliminates Garbage Collection (GC) spikes, untangles spaghetti audio logic, and provides deep visual observability into the live signal graph.

**Who is this for?** It is built for teams working with professional audio engineers who are used to the capabilities of mature audio middleware, but feel restricted by the web platform's native tools. If you need data to drive your sound — not raw code — this is for you.

---

## ⚡ Is SceneGrid right for you? (Alternatives)

SceneGrid is an **Enterprise-grade** tool designed to solve complex routing, polyphony culling, and memory-leak issues in massive projects.

- If you are building a lightweight promo site, an indie Match-3 game, or just need to play a few sound effects quickly with a great Developer Experience, **you probably don't need SceneGrid.** We highly recommend checking out [zvuk](https://github.com/schmooky/zvuk) for excellent, lightweight plug-and-play solutions.
- If you are building a **heavy 60-FPS game, a complex WebGL experience, or a multi-state interactive app** where Garbage Collection spikes cause visual stuttering, and you need a visual debugger to understand _why_ a specific sound was ducked or culled—**SceneGrid is built for you.**

---

## 🚀 Quick Start

The system follows a strict **Data-Driven** pattern. Defining assets and routing upfront enables SceneGrid to validate the signal graph and trace errors before any sound is even triggered.

### 1. Installation

Install the engine and the optional visual inspector (debugger):

```bash
npm install @scene-grid/engine
npm install @scene-grid/debugger --save-dev
```

### 2. Initialization

Here is a standard bootstrap flow demonstrating strong typing, asset loading, and attaching the dev tools (based on our `examples/main.ts`):

```typescript
import { AudioEngine, WorkletLoader } from '@scene-grid/engine';

// Import your data-driven manifests (routing, snapshots, events, etc.)
import { Buses, Snapshots, SoundMap, Events, BankManifest, SoundManifest } from './audio-config/index.js';

// 1. Strongly type the engine by extending the SceneGridRegistry
declare module '@scene-grid/engine' {
    export interface SceneGridRegistry {
        SoundIds: keyof typeof SoundMap;
        EventIds: keyof typeof Events;
        BankIds: keyof typeof BankManifest;
        SnapshotIds: keyof typeof Snapshots;
    }
}

async function bootstrap() {
    // 2. Instantiate the Engine
    const audio = new AudioEngine({
        manifest: SoundManifest,
        buses: Buses,
        snapshots: Snapshots,
        soundMap: SoundMap,
        events: Events,
        banks: BankManifest,
        globalVoiceLimit: 32 // Critical for GC Safety & Culling
    });

    // 3. Subscribe to lifecycle events (Decoupled from UI)
    audio.events.on('load:progress', ({ progress, lastLoadedResource }) => {
        console.log(`Loading: ${Math.round(progress * 100)}% (${lastLoadedResource})`);
    });

    // 4. Initialize engine and load assets
    await audio.init({ isStrictValidation: false });
    await audio.banks.load('music');

    // 5. Browser Security: Unlock AudioContext via User Interaction
    globalThis.addEventListener('pointerup', async () => {
        await audio.unlock();
        await audio.mixer.setState('idle');

        // Trigger strongly-typed sounds
        audio.play('backgroundMain', { isLoop: true });

        // 6. Attach the visual inspector (only in development)
        if (process.env.NODE_ENV !== 'production') {
            const { attachDebugUI, initAudioDebugPanel } = await import('@scene-grid/debugger');
            await attachDebugUI(audio, { wrapperSelector: '#wrapper', workletLoader: WorkletLoader });
            initAudioDebugPanel(audio);
        }
    }, { once: true });
}

bootstrap().catch(console.error);
```

---

## ✨ Features at a Glance

* **Zero-Allocation Object Pools:** Eliminates GC spikes during heavy gameplay by managing voices via `O(1)` free-list stacks.
* **Deterministic Voice Culling:** Transparently virtualizes low-priority sounds in the background to guarantee strict FPS stability.
* **Total Recall Snapshots:** Safely layer mix states (e.g., "Combat Layer" over "Explore Layer") with zero-latency protection and crossfading.
* **Lookahead Sidechain Ducking:** Predictive attenuation powered by an `AudioWorklet` to duck background music *before* the trigger peak.
* **Deterministic Parameter Control (RTPC):** Connect game variables to audio properties with fixed, FPS-independent slew rates (inertia).
* **Predictable Parallel Routing:** Tap and send audio to global FX chains (like Reverbs) without breaking acyclic graph observability.
* **Horizontal Music Sequencing:** Built-in musical quantization and audio sprites for seamless, beat-accurate transitions.
---

## 🏗️ Architecture & Documentation

The system is built using **Hexagonal Architecture (Ports & Adapters)**, ensuring that the core reasoning logic remains independent of the Web Audio API. This decoupling lays the foundation for future offline simulation, allowing the core domain to mathematically evaluate mixer states without requiring active audio playback.

| Layer              | Responsibility      | Content                                                           |
| ------------------ | ------------------- | ----------------------------------------------------------------- |
| **Domain**         | Pure Business Logic | Mixer state, Routing logic, Culling rules, Port definitions.      |
| **Infrastructure** | Technical Adapters  | Web Audio Node implementations, Worklet processors, File loading. |
| **Application**    | Orchestration       | System bootstrapping, high-level API Facades (`AudioEngine`).     |
| **Kernel**         | Math & Performance  | RTPC modulation engine, curve evaluation, high-speed math.        |
| **Shared**         | Cross-cutting       | Mathematical constants, shared types, and universal guards.       |


### 📚 Documentation & Diagrams

For a deep dive into the system's topology, including **C4 Container Diagrams** and the complete **Audio Signal Flow**, please refer to the detailed documentation:

- 🇬🇧 [Audio System Architecture - English](./docs/ARCHITECTURE.md)
- 🇷🇺 [Архитектура Аудио Системы - Русский](./docs/ARCHITECTURE[RU].md)

---

## 🎛️ Audio Debugger & Visualizer (DevTools MVP)

Because SceneGrid separates Domain Logic from Web Audio Infrastructure, the visual tools are provided as a completely independent package: **`@scene-grid/inspector`**.

Act as a true audio engineer: monitor Bus levels, RMS envelopes, and Spectrum Analysis to ensure your mix stays out of the red, and trace exactly why a specific snapshot or RTPC curve is affecting your audio—all without adding a single byte to your production runtime bundle.

---

## 📦 Monorepo Packages

SceneGrid is structured as a monorepo to enforce strict architectural boundaries between the runtime engine and developer tooling:

- **`@scene-grid/engine`**: The core zero-allocation audio runtime and domain logic.
- **`@scene-grid/inspector`**: A fully decoupled, drop-in visual debugger and profiler UI.
- **`@scene-grid/shared`**: High-performance math kernels, randomizers, and shared domain types.
- **`@scene-grid/cli`**: Ahead-of-Time audio processing and manifest generation utilities.
- **`@scene-grid/mcp-server`**: A Model Context Protocol (MCP) server providing standardized external access to engine telemetry and control APIs.

---

## 🚀 Roadmap: Towards a Complete Observability Ecosystem

_Note: Core stability and Parameter Resolution Pipeline are part of the v1.0 milestone. The following roadmap outlines the evolution of the engine towards a full Audio Observability Platform._

### 🔴 Phase 1: Observability & "Hot Swap" DX (v1.1)

- ✅ **In-Game Inspector 2.0 (SceneGrid DevTools):** Enhancing the current `@scene-grid/inspector` into a deep interactive overlay. Developers can visually trace voice culling decisions, tweak RTPCs, test snapshots, and adjust bus gains in real-time over the game canvas.
- ✅ **Anti-Flutter Voice Culling (Hysteresis):** Adding a time buffer to the virtualization logic to prevent rapid fade-in/fade-out ("flutter") during stress tests, keeping the debug trace clean.
- ✅ **Event-Driven State Machine:** Moving beyond `play(sound)`. Exposing autonomous behaviors (`onPlay`, `onStop`, tails) so DevTools can track the entire lifecycle of an audio entity.
- ✅ **Hot Swap Architecture:** Soft-reloading of JSON configurations via state diffing without page reloads.

### 🟡 Phase 2: Telemetry & Live Bridge (v1.2)

- ✅ **Remote Sync Adapter (The Live Bridge):** An infrastructure module powered by WebSockets. Allows a running `AudioEngine` to act as a client, broadcasting telemetry and receiving live property updates from external authoring tools.
- ✅ **Telemetry API (MCP Server):** A Model Context Protocol server that provides standardized external access to engine telemetry and control APIs.
- ✅ **AOT Asset Pipeline & Streaming:** CLI utility for Ahead-of-Time audio processing, manifest generation, and a chunked streaming pipeline for large assets.
- **SceneGrid CLI Bridge:** A Node.js utility that monitors your local workspace and pushes changes directly into your running game instance.
- **Semantic Music States:** Logic-based states (e.g., _Exploration_ → _Combat_) where the engine automatically resolves loop regions and layers, providing a single source of truth for the debugger.
- **Internal Modulators:** Native LFOs and Envelopes for continuous parameter modulation, decoupling audio animation from the game engine's main ticker for maximum stability.

### 🟢 Phase 3: Offline Simulation & SceneGrid Studio (v2.0)

- **Offline Simulation API:** A headless engine adapter for mathematically simulating mixer states, evaluating RTPC curves, and predicting voice culling decisions without an active browser `AudioContext`.
- **SceneGrid Studio (Standalone Web App):** A fully decoupled, visual authoring and simulation tool. Build routing graphs, draw RTPC curves, and simulate mix states offline. Changes are pushed instantly to your running game via the Live Bridge.
- **Environment System:** Logic-based Reverb Zones and Acoustic States utilizing the existing Aux Sends.
- **Dattorro Reverb Integration:** Implementing high-quality, algorithmic plate reverb natively as the standard FX Bus plugin for acoustic environments.

---

## License

Copyright © 2025-2026 Igor Zabrodin.

Licensed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.

SceneGrid is free to use in commercial products, games, websites, and applications.

---

## Support & Sponsorship

If SceneGrid helps your project, consider supporting its development:

- 💰 **[GitHub Sponsors](https://github.com/sponsors/rapt0p7)** — Recurring support
- ☕ **[Buy Me a Coffee](https://buymeacoffee.com/rapt0p7)** — One-time tip
- 🎁 **[Patreon](https://patreon.com/rapt0p7)** — Join the community

**SceneGrid Studio** (Commercial SaaS) is coming soon — a professional-grade authoring and testing platform for complex audio projects.

---
