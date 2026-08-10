## Context

The audio engine's `EngineTicker` currently drives all time-based systems using a floating time accumulator (milliseconds). See `proposal.md` for why this approach causes unacceptable jitter.

## Goals / Non-Goals

**Goals:**
- Guarantee 100% deterministic, batch execution of scheduled tasks.
- Keep the `EngineTicker` responsible for scheduling without coupling it to any specific downstream implementation.
- Define exact Ports for external communication (`ITickable`).

**Non-Goals:**
- Changing the base tick rate (currently 15ms).
- Refactoring the internal logic of the systems triggered by the ticker (e.g., how the Sequencer processes notes, only *when* it is called).

## Decisions

### 1. Modifying the `IEngineTicker` Port
- **Decision:** Change `interval` parameter from milliseconds to `divider` (integer) in `IEngineTicker.add`. (Note: `ITickable` remains unchanged since the interval is passed during registration, not on the tickable itself).
- **Rationale:** The port must explicitly demand an integer multiplier to enforce the Control Rate architecture. This ensures compile-time safety and prevents consumers from passing arbitrary ms values.
- **Alternatives Considered:** Allowing both ms and dividers. Rejected because it maintains complexity and risks future drift if ms values are used inadvertently.

### 2. State Management in `EngineTicker`
- **Decision:** The `EngineTicker` will track a single monotonic `currentTick` integer.
- **Rationale:** Comparing `currentTick % task.divider === 0` is extremely cheap and completely deterministic. This separates the control-plane scheduling structure from data-plane mutations. Time (in ms) is still passed down for DSP calculations, but the *trigger* is integer-based.
- **Alternatives Considered:** Keeping per-task accumulators but snapping them to the grid. Rejected as overly complex and prone to floating-point drift over long sessions.

## Risks / Trade-offs

- **Risk:** Existing systems may rely on the exact millisecond values for internal interpolations. 
  - **Mitigation:** Ensure the `tick` method still provides `deltaTime` (calculated as `divider * BASE_TICK_RATE`) to downstream systems so their DSP logic remains mathematically accurate.
- **Risk:** High divider values might cause bursty execution on frames where many dividers align (e.g., common multiples).
  - **Mitigation:** Monitor performance in the `Inspector`. If necessary, future optimizations could include tick offset phases, but this is out of scope for the current fix.
