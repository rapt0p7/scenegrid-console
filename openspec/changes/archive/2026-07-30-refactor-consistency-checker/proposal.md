# Refactor ConsistencyChecker

## What
Refactor the `ConsistencyChecker` (~1450 lines) to use the Composite pattern and act as a true composition root. We will split its validation logic into smaller, focused `IValidationRule` implementations.

## Why
The current `ConsistencyChecker` is a "God Object" that violates the Single Responsibility Principle, making it difficult to maintain, extend, and test isolated validation cases. A plugin-based architecture will improve code health, ensure adherence to the Open/Closed Principle, and align with the project's Hexagonal architecture.

### Repowise Health Evidence
A Repowise health scan confirms this file is a major defect risk (Health Score: 5.65/10) with the following critical violations:
- **God Class**: 1154 lines across 37 methods.
- **Low Cohesion**: LCOM4=2 (the file handles multiple disjointed concepts).
- **Extreme Cyclomatic Complexity**: Methods like `checkEvents` (CCN 69, 7 levels of nesting), `checkBankSystem` (CCN 33), and `checkOrphanManifestSounds` (CCN 33) are practically unmaintainable.
- **DRY Violation**: 32% of the file contains logic duplicated elsewhere (e.g., `AudioEngine.ts`).

By splitting this file into smaller `IValidationRule` classes, we directly address these architectural health warnings while maintaining the required AOT (Ahead-Of-Time) validation.

## Scope
- Refactor `ConsistencyChecker.ts` into a `ValidationContext` and multiple `IValidationRule` implementations.
- Implement the Composite pattern in `SoundMapRule` using `ISoundValidationRule` to handle specific sound configurations (SmartLoop, Containers, etc.).
- Ensure existing integration tests (`ConsistencyChecker.test.ts`) pass without significant changes, preserving the exact public API.
