<div align="center">

# SceneGrid Console

**Data-driven audio middleware & runtime observability platform for the web.**
*Zero-GC audio engine, deterministic voice culling, and live visual inspection for web games.*

[![CI Checks](https://github.com/rapt0p7/scenegrid-console/actions/workflows/ci.yml/badge.svg)](https://github.com/rapt0p7/scenegrid-console/actions/workflows/ci.yml)
[![Publish to NPM](https://github.com/rapt0p7/scenegrid-console/actions/workflows/publish.yml/badge.svg)](https://github.com/rapt0p7/scenegrid-console/actions/workflows/publish.yml)
[![NPM Version](https://img.shields.io/npm/v/@scene-grid/engine.svg?style=flat-square)](https://www.npmjs.com/package/@scene-grid/engine)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
<br>
[![Mutation testing badge](https://img.shields.io/endpoint?style=flat&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Frapt0p7%2Fscenegrid-console%2Fmain)](https://dashboard.stryker-mutator.io/reports/github.com/rapt0p7/scenegrid-console/main)
[![codecov](https://codecov.io/gh/rapt0p7/scenegrid-console/graph/badge.svg?token=3KQ9G3APV4)](https://codecov.io/gh/rapt0p7/scenegrid-console)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/0810c1db16c74c96b41c5e4008c5ee43)](https://app.codacy.com/gh/rapt0p7/scenegrid-console/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![Code health](https://api.repowise.dev/badge/health/rapt0p7/scenegrid-console.svg)](https://repowise.dev/repo/rapt0p7/scenegrid-console)
![specs](https://raw.githubusercontent.com/rapt0p7/scenegrid-console/gh-pages/badges/number_of_specs.svg)
![requirements](https://raw.githubusercontent.com/rapt0p7/scenegrid-console/gh-pages/badges/number_of_requirements.svg)
<br>
[![keep the why](https://rapt0p7.github.io/scenegrid-console/dashboard/live/badge-entries-flat.svg)](https://rapt0p7.github.io/scenegrid-console/dashboard/live/)
[![Ask DeepWiki](https://img.shields.io/badge/Ask%20DeepWiki-4B6BFB?logo=bookstack&logoColor=white)](https://deepwiki.com/rapt0p7/scenegrid-console)
[![OpenWiki Visualizer](https://img.shields.io/badge/OpenWiki-Visualizer-blue?logo=diagram-project&logoColor=white)](https://rapt0p7.github.io/scenegrid-console/openwiki-visualizer/)
[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/rapt0p7/badge.svg)](https://hub.xerj.org/contributors/rapt0p7)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)

<br>

<img src="./docs/Inspector.png" alt="SceneGrid Audio Debugger & Live Signal Inspector" width="850">

</div>

---

## 💡 Why SceneGrid?

Modern 60-FPS web games and WebGL experiences fail when browser Garbage Collection (GC) pauses audio or causes frame stuttering. Standard web audio libraries treat sound as isolated triggers; **SceneGrid brings AAA-grade audio middleware (FMOD/Wwise architecture) to the browser.**

| Feature | Standard Web Audio / Howler | SceneGrid |
| :--- | :--- | :--- |
| **Memory Allocation** | Frequent GC spikes during heavy playback | **Zero-allocation object pools** (`O(1)` free-list & swap-and-pop) |
| **Voice Management** | Uncontrolled polyphony / overlapping | **Deterministic voice culling & virtualization** (with hysteresis) |
| **Mixing States** | Manual volume math in game logic | **Total Recall VCA Snapshots** & multi-layer crossfades |
| **Observability** | Console logs / blind debugging | **Real-time DevTools inspector, cause chains & signal graph** |
| **Dynamic Audio (RTPC)** | Raw frame-by-frame setters | **FPS-independent modulation curves & slew-rate inertia** |
| **Interactive Music** | Manual track switching / drift | **Autonomous FSM Music Conductor** & beat-quantized smart loops |
| **Config & Routing** | Imperative code / silent runtime failures | **AOT Static Graph Validation** (cycle detection & RAM quotas) |

> ℹ️ *Building a simple promo site or lightweight puzzle? You probably don't need SceneGrid — check out [zvuk](https://github.com/schmooky/zvuk) or [soundhub](https://github.com/chriscreativecode/soundhub). If you're building a high-load game engine with complex routing — SceneGrid is for you.*

---

## ⚡ Quick Start

### 1. Install

```bash
npm install @scene-grid/engine
npm install @scene-grid/debugger --save-dev
```

### 2. Minimal Example

```typescript
import { AudioEngine, WorkletLoader } from '@scene-grid/engine';
import * as config from './audio-config/index.js';

// 1. Initialize engine with your data-driven manifests & voice limits
const audio = new AudioEngine({
  ...config,
  globalVoiceLimit: 32 // Hard limit to eliminate GC spikes
});

await audio.init({ isStrictValidation: true });

// 2. Play sound on user interaction (unlocked browser context)
window.addEventListener('pointerup', async () => {
  await audio.unlock();
  audio.play('backgroundMain', { isLoop: true });

  // 3. Attach live visual inspector in development
  if (process.env.NODE_ENV !== 'production') {
    const { attachDebugUI, initAudioDebugPanel } = await import('@scene-grid/debugger');
    await attachDebugUI(audio, { wrapperSelector: '#wrapper', workletLoader: WorkletLoader });
    initAudioDebugPanel(audio);
  }
}, { once: true });
```

👉 *For full TypeScript manifest generation, sound maps, banks, and HMR setup, see [examples/main.ts](./examples/main.ts).*

---

## ✨ Key Features

* **Zero-Allocation Pools (DOD):** Eliminates frame stutter by pooling voices and telemetry into static flat arrays with `O(1)` swap-and-pop cleanup.
* **Deterministic Voice Culling:** Transparently virtualizes low-priority sounds with anti-flutter hysteresis when the audio budget is exceeded.
* **AOT Static Graph Validation:** Catches routing cycles, ghost ducking conflicts, and RAM quota violations at startup before allocating Web Audio nodes.
* **Total Recall VCA Snapshots:** Superimposes multi-layer mix states (e.g., *Exploration* → *Combat*) with sample-accurate crossfades.
* **Lookahead Sidechain Ducking:** Predictive attenuation via `AudioWorklet` to dip background buses *before* transient peaks hit.
* **Interactive Music & Smart Loops:** Autonomous FSM conductor, overlap-preserving loops (`preEntry` / `tail`), phase-aware jumps, and beat-quantized stingers.
* **Event Macros & Logical Containers:** Semantic `postEvent()` triggers, `Switch` / `Scatterer` containers, and deterministic variations via `SeededPRNG`.
* **Memory Hygiene & LRU Quotas:** Logical asset banks, concurrency-throttled decoding, and automatic LRU buffer eviction to prevent OOM crashes.
* **Decoupled Hexagonal Architecture:** Domain logic is strictly separated from Web Audio nodes, with live HMR config reloading and full IDE autocomplete.

---

## 📦 Packages in this Monorepo

| Package | Purpose |
| :--- | :--- |
| [![@scene-grid/engine](https://img.shields.io/npm/v/@scene-grid/engine.svg?label=%40scene-grid%2Fengine&style=flat-square&logo=npm)](./packages/engine) | Core zero-allocation runtime and domain audio logic |
| [![@scene-grid/debugger](https://img.shields.io/npm/v/@scene-grid/debugger.svg?label=%40scene-grid%2Fdebugger&style=flat-square&logo=npm)](./packages/debugger) | In-game visual overlay, live bus meters, and voice culling tracer |
| [![@scene-grid/inspector](https://img.shields.io/npm/v/@scene-grid/inspector.svg?label=%40scene-grid%2Finspector&style=flat-square&logo=npm)](./packages/inspector) | Standalone UI inspector components |
| [![@scene-grid/cli](https://img.shields.io/npm/v/@scene-grid/cli.svg?label=%40scene-grid%2Fcli&style=flat-square&logo=npm)](./packages/cli) | Ahead-of-Time asset processing & manifest generator |
| [![@scene-grid/mcp-server](https://img.shields.io/npm/v/@scene-grid/mcp-server.svg?label=%40scene-grid%2Fmcp-server&style=flat-square&logo=npm)](./packages/mcp-server) | Model Context Protocol server for AI/tooling telemetry |
| [![@scene-grid/shared](https://img.shields.io/npm/v/@scene-grid/shared.svg?label=%40scene-grid%2Fshared&style=flat-square&logo=npm)](./packages/shared) | Shared kernels, type definitions, and math helpers |

---

## 📖 Deep Dives & Documentation

Detailed architectural decisions and design docs are available separately:

* 🏛️ **[Architecture Guide (C4 & Topology)](./docs/ARCHITECTURE.md)** — English | [Русская версия](./docs/ARCHITECTURE[RU].md)
* 🎛️ **[Audio Signal Flow Diagram](./docs/audio-flow.svg)**
* 🗺️ **[Development Roadmap & Milestones](./ROADMAP.md)**

---

## Support & Sponsorship

If SceneGrid helps your project, consider supporting its development:

- 💰 **[GitHub Sponsors](https://github.com/sponsors/rapt0p7)** — Recurring support
- ☕ **[Buy Me a Coffee](https://buymeacoffee.com/rapt0p7)** — One-time tip
- 🎁 **[Patreon](https://patreon.com/rapt0p7)** — Join the community

---

## 📄 License

MIT © [Igor Zabrodin](https://github.com/rapt0p7). Free for commercial games, apps, and interactive sites.
