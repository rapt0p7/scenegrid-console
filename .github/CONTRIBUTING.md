# Contributing to SceneGrid Console

Welcome to the **SceneGrid Console** project!

This project is a virtual digital mixing console built on top of the Web Audio API. Our top priorities for this architecture are predictability, stability (zero digital artifacts), and strict layer isolation.

Before you start writing code, please read the architectural rules and contribution standards outlined below.

---

## 🏗 Architecture & Strict Boundaries (Clean Architecture & DDD)

The project is built on Domain-Driven Design (DDD) principles. We use `dependency-cruiser` and `eslint-plugin-boundaries` to enforce strict dependency rules. **If your code violates these boundaries, the CI pipeline will block your commit.**

### Core Layers & Dependency Rules:

1. **`@webaudio-core` (Domain Core):**
    * **Rule:** The core is completely isolated. It is **strictly prohibited** from importing anything from other application folders (Managers, BusSystem, Configs, etc.).
    * **Access:** External modules can only access the core via the public facade: `src/webaudio-core/index.ts`. Deep imports are forbidden.
2. **`interfaces` (Abstraction Layer):**
    * **Rule:** Contains only TypeScript types and interfaces. Importing business logic is forbidden. Only `import type { ... }` from the core is allowed.
3. **`config` (Data & Manifests):**
    * **Rule:** Configuration files are pure data. They cannot import execution logic (Managers, Core).
4. **`helpers` (Utilities):**
    * **Rule:** Pure functions and math operations (e.g., `rtpcMath`). They must remain completely unaware of Managers, Buses, or business logic.
5. **`BusSystem` & `Core` (Processors / Plugins):**
    * **Rule:** These are "dumb" workers. They are forbidden from importing Managers or Configs.
6. **`Managers` (Orchestrators):**
    * **Rule:** They orchestrate the buses and the core, but they **must not** import the main system facade (`AudioEngine.ts` / `AudioRouter.ts`). The control flow is strictly top-down.

---

## 📜 Commit Guidelines (Conventional Commits)

We use a strict commit messaging system, enforced automatically by `husky` and `commitlint`. Every commit must match the following format:

```text
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Allowed Types (`type`)
* `feat`: A new feature
* `fix`: A bug fix
* `docs`: Documentation only changes
* `refactor`: A code change that neither fixes a bug nor adds a feature
* `perf`: A code change that improves performance
* `test`: Adding or correcting tests
* `build`: Changes that affect the build system or dependencies (Webpack, npm)
* `ci`: Changes to CI/CD configuration files and scripts
* `style`: Changes that do not affect the meaning of the code (Prettier, ESLint fixes)
* `chore`: Other changes that don't modify src or test files

### Allowed Scopes (`scope`)
Your commit must precisely indicate the affected module using **kebab-case**.

**Architectural Modules:**
* `core`, `core-nodes`, `core-context` — Internals of `webaudio-core`
* `facade` — `AudioEngine`, `AudioRouter`
* `bus-system` — Routing and bus logic
* `mixer` — Layers, snapshots, and states
* `rtpc` — Macros and parameter modulation
* `smart-loop` — Interactive music, transitions, grid
* `plugins` — Insert filters, limiters, sidechain
* `worklets` — `AudioWorklet` processors
* `loader` — Buffer loading and decoding
* `scheduling` — Playback scheduling, voice culling
* `automation` — Automation engine, value curves
* `managers`, `config`, `helpers`, `interfaces`

**Infrastructure:**
* `api`, `readme`, `architecture`, `examples` — for `docs`
* `deps`, `bundler`, `typescript` — for `build`
* `unit`, `integration`, `mocks` — for `test`

*Example of a good commit message:*
> `feat(rtpc): add custom piecewise linear curves for pitch modulation`
> `fix(bus-system): prevent duplicate connections to master output`

*(Note: The subject line must be lower-case and must not end with a period).*

---

## ✅ Development Workflow (Pull Requests)

1. **Create a branch** from `main` (format: `feat/your-feature`, `fix/issue-description`).
2. **Write your code**, strictly respecting the module boundaries (Clean Architecture).
3. **Update tests**. If you added new functionality, write unit or integration tests using `vitest`.
4. **Run local checks** before committing:
    * **Tests:** `npm run test` or `npm run test:coverage`
    * **Linting & Formatting:** Handled automatically on pre-commit via `lint-staged` (ESLint + Prettier).
    * **Architecture Check:** `npm run createDependencyGraph` to ensure `dependency-cruiser` passes and generates the latest mermaid graph.
5. **Commit your changes.** Husky will automatically lint your commit message.
6. **Open a Pull Request.** Ensure the CI pipeline passes all checks.

---

## 🛠 System Invariants (Strictly Prohibited Actions)

When contributing new code, ensure you do not violate the engine's core guarantees:
* **DO NOT** connect audio sources (Voices) directly to the `MasterOutput` bypassing the group buses (`AudioBus`).
* **DO NOT** bypass the automation engine (all parameter changes must flow through `AutomationEngine` or `RTPCManager`).
* **DO NOT** create Feedback Loops within the `Sends` system (mutual sends between buses are strictly forbidden).

Thank you for contributing to the SceneGrid Console!
