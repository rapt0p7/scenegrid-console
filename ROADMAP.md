# 🚀 SceneGrid Roadmap: Towards a Complete Observability Ecosystem

> _Note: Core stability and Parameter Resolution Pipeline are part of the v1.0 milestone. The following roadmap outlines the evolution of the engine towards a full Audio Observability Platform._

---

## 🔴 Phase 1: Observability & "Hot Swap" DX (v1.1)

- ✅ **In-Game Inspector 2.0 (SceneGrid DevTools):** Enhancing the current `@scene-grid/inspector` into a deep interactive overlay. Developers can visually trace voice culling decisions, tweak RTPCs, test snapshots, and adjust bus gains in real-time over the game canvas.
- ✅ **Anti-Flutter Voice Culling (Hysteresis):** Adding a time buffer to the virtualization logic to prevent rapid fade-in/fade-out ("flutter") during stress tests, keeping the debug trace clean.
- ✅ **Event-Driven State Machine:** Moving beyond `play(sound)`. Exposing autonomous behaviors (`onPlay`, `onStop`, tails) so DevTools can track the entire lifecycle of an audio entity.
- ✅ **Hot Swap Architecture:** Soft-reloading of JSON configurations via state diffing without page reloads.

---

## 🟡 Phase 2: Telemetry & Live Bridge (v1.2)

- ✅ **Remote Sync Adapter (The Live Bridge):** An infrastructure module powered by WebSockets. Allows a running `AudioEngine` to act as a client, broadcasting telemetry and receiving live property updates from external authoring tools.
- ✅ **Telemetry API (MCP Server):** A Model Context Protocol server that provides standardized external access to engine telemetry and control APIs.
- ✅ **AOT Asset Pipeline & Streaming:** CLI utility for Ahead-of-Time audio processing, manifest generation, and a chunked streaming pipeline for large assets.
- ⏳ **SceneGrid CLI Bridge:** A Node.js utility that monitors your local workspace and pushes changes directly into your running game instance.
- ✅ **Semantic Music States (`MusicConductor` FSM):** Logic-based states (e.g., _Exploration_ → _Combat_) where the engine automatically resolves loop regions and layers, providing a single source of truth for the debugger.
- ⏳ **Internal Modulators:** Native LFOs and Envelopes for continuous parameter modulation, decoupling audio animation from the game engine's main ticker for maximum stability.

---

## 🟢 Phase 3: Offline Simulation & SceneGrid Studio (v2.0)

- ⏳ **Offline Simulation API:** A headless engine adapter for mathematically simulating mixer states, evaluating RTPC curves, and predicting voice culling decisions without an active browser `AudioContext`.
- ⏳ **SceneGrid Studio (Standalone Web App):** A fully decoupled, visual authoring and simulation tool. Build routing graphs, draw RTPC curves, and simulate mix states offline. Changes are pushed instantly to your running game via the Live Bridge.
- ⏳ **Environment System:** Logic-based Reverb Zones and Acoustic States utilizing the existing Aux Sends.
- ⏳ **Dattorro Reverb Integration:** Implementing high-quality, algorithmic plate reverb natively as the standard FX Bus plugin for acoustic environments.
