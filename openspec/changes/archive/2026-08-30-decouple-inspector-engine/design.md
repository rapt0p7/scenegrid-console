## Context

See proposal.md for motivation. The inspector needs to observe and manipulate audio engine states (e.g. visualizing nodes, debugging properties), but the current implementation passes typed objects from the engine and imports those types into the inspector.

## Goals / Non-Goals

**Goals:**
- Remove all @scene-grid/engine imports from the inspector.
- Retain strict type-safety by implementing structural typing in the inspector.

**Non-Goals:**
- Changing the runtime architecture of how the inspector hooks into the engine.
- Serializing the audio nodes over a message bus (Web Audio nodes must be manipulated directly in memory).

## Decisions

**Decision: Local Minimal Interfaces (Structural Typing)**
We will define minimal interfaces inside packages/inspector/src/types/engine-proxies.ts that represent only the properties the inspector actually uses from engine objects. 
*Alternatives Considered*: Moving engine types to packages/shared. Rejected because it would move domain-specific concepts into a generic shared package, bloating it and complicating architectural purity.

## Risks / Trade-offs

- **Risk**: Engine type changes could silently break the inspector.
  - **Mitigation**: Keep the local proxy interfaces as minimal as possible (only the fields read by inspector) to reduce surface area.

