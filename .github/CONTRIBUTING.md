# Contributing to SceneGrid Console

Welcome to the **SceneGrid Console** project!

This is a high-performance virtual mixing engine. To ensure long-term stability and testability, we strictly enforce **Hexagonal Architecture (Ports & Adapters)**. Our goal is to keep the "Mixing Logic" (Domain) entirely decoupled from the "Audio Drivers" (Infrastructure/Web Audio API).

---

## 🏗 Architectural Layers & Dependency Rules

We use `dependency-cruiser` to enforce the **Inward Dependency Rule**: logic flows toward the center (Domain), and the center is agnostic of the outside world.

### 1. Domain Layer (`packages/engine/src/Domain`) — _The Golden Circle_

- **Role:** Pure business logic (Mixer states, routing calculations, voice culling rules).
- **Strict Rule:** **ZERO dependencies on Web Audio API.** You must not import `AudioContext`, `GainNode`, or any browser-specific audio types.
- **Communication:** Defines **Ports** (interfaces) that describe what the engine needs (e.g., `IAudioBusSystem`).

### 2. Infrastructure Layer (`packages/engine/src/Infrastructure`) — _Adapters_

- **Role:** Technical implementation of Domain Ports. This is where the Web Audio nodes, `AudioWorklet` processors, and buffer loaders reside.
- **Dependency:** May depend on `Domain` (to implement ports) and `Shared`.

### 3. Kernel Layer (`packages/engine/src/Kernel`) — _The Math Engine_

- **Role:** High-performance, performance-critical mathematical code (RTPC modulation engine, curve evaluation).
- **Dependency:** May depend on `Shared` and `Domain/*/Ports`. It must remain stateless and optimized for high-frequency execution.

### 4. Application Layer (`packages/engine/src/Application`) — _The Orchestrator_

- **Role:** Bootstrapping and coordinating use cases. The `AudioEngine` facade and high-level orchestration live here.
- **Dependency:** Can depend on all layers to "wire" the adapters to the domain.

### 5. Shared Layer (`packages/src/Shared`) — _Common Utilities and Types_

- **Role:** Mathematical constants, universal types, and guards used by all layers.
- **Strict Rule:** Must have **zero dependencies** on other internal layers.

---

## 📜 Commit Guidelines (Conventional Commits)

We use a strict commit messaging system. Every commit must follow the format: `<type>(<scope>): <subject>`

### Allowed Types

- `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

### Scopes (Aligned with Hexagonal Layers)

Your scope must indicate the affected layer or logical module:

- **Layer Scopes:** `domain`, `infra`, `kernel`, `app`, `shared`.
- **Domain Components:** `mixer`, `router`, `registry`, `orchestration`, `culling`, `logic`.
- **Infrastructure Components:** `bus-adapter`, `dsp`, `voices`, `output`, `automation`, `loader`, `context`, `nodes`.
- **Quality & Tooling:** `test`, `unit`, `integration`, `mocks`, `build`, `ci`, `readme`, `api`, `architecture`.

_Example of a good commit:_

> `feat(domain/mixer): add VCA-style scaling logic for multi-layered snapshots`
> `fix(infra/dsp): resolve memory leak in SidechainDucker worklet`

---

## 🛠 System Invariants (Strictly Prohibited)

To protect the integrity of the engine, the following are strictly forbidden:

1.  **Domain Pollution:** Importing anything from `packages/engine/src/Infrastructure` or `packages/engine/src/Application` into `packages/engine/src/Domain`.
2.  **Bypass Routing:** Connecting audio sources (Voices) directly to the Master Output. All signals **must** flow through the hierarchical `AudioBus` system.
3.  **Direct Parameter Manipulation:** Bypassing the `RTPCManager` or `AutomationEngine`. All real-time parameter changes must be batched and throttled to protect the Audio Thread.
4.  **Circular Dependencies:** Creating circular references between components (e.g., `Mixer` calling `Router` while `Router` calls `Mixer`). Use events or third-party orchestrators.

---

## ✅ Development Workflow

1.  **Branching:** Create a branch from `main` (e.g., `feat/kernel-optimizations`).
2.  **Architecture Verification:** Run `npm run lint:architecture` (or your equivalent `dependency-cruiser` command). If you imported an Infra adapter into a Domain service, the build **will** fail.
3.  **Unit Testing:** \* **Domain Logic:** Test using pure TypeScript mocks (no `AudioContext` required).
    - **Infrastructure:** Use integration tests with `vitest` and Web Audio mocks.
4.  **Submission:** Ensure all tests pass and the dependency graph remains clean.

---

## 🎛 Visualizing the Boundaries

Always keep the **Ports and Adapters** pattern in mind:

- **The Domain** defines the _Interface_ (The Port).
- **The Infrastructure** defines the _Implementation_ (The Adapter).

If you need to access a new Web Audio feature, first define its logical behavior as an interface in `packages/engine/src/Domain/BusSystem/Ports`.

Thank you for contributing to the **SceneGrid Console**!
