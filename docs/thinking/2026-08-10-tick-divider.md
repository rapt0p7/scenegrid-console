# Logical Thinking Process: Tick Divider Architecture

## Phase 1: Current Reality Tree (CRT)

**Undesirable Effect (UDE):** Scheduled audio events and automatic events lose synchronization accuracy over time.

- **IF** the `EngineTicker` pulses at a fixed 15ms base rate,
- **AND IF** systems (like the sequencer or automation engine) specify their own arbitrary intervals in milliseconds (e.g., 20ms),
- **THEN** a system's interval will often not be a clean multiple of the 15ms base rate.
- **IF** a system's interval is not a clean multiple of the base rate,
- **THEN** its accumulator will overshoot its target before executing (e.g., a 20ms task firing at 30ms and carrying over a 10ms remainder).
- **IF** execution is repeatedly delayed by these unpredictable overshoots across different systems,
- **THEN** scheduled events handled by these different systems lose synchronization accuracy (phase drift/jitter).

## Phase 2: Evaporating Cloud (EC)

- **A** (Objective): Audio engine components are synchronized accurately.
- **B** (Requirement 1): Accommodate different update frequencies for different systems.
- **C** (Requirement 2): Prevent execution drift/jitter over time.
- **D** (Want for B): Allow systems to specify arbitrary millisecond intervals.
- **D'** (Want for C): Restrict systems to intervals that are exact integer multiples of the base rate.

**Conflict:** D vs D'.
**Broken Assumption:** We assume systems *need* arbitrary millisecond intervals (D) to achieve different update frequencies (B).
**Injection:** Refactor `EngineTicker` to use a strict Control Rate pattern based on integer multipliers (dividers) rather than arbitrary milliseconds.

## Phase 3: Future Reality Tree (FRT)

- **IF** systems register with a `divider` (integer multiple of the base rate) instead of an arbitrary millisecond interval,
- **THEN** every system's interval is a mathematically exact multiple of the base rate.
- **IF** intervals are exact multiples,
- **THEN** there are no fractional remainders or overshoots in the accumulator.
- **IF** there are no overshoots and the engine uses deterministic batching (evaluating `currentTick % divider === 0`),
- **THEN** systems that need to update simultaneously will always do so in the exact same frame.
- **IF** systems execute deterministically without drift,
- **THEN** the Sequencer, RTPC Manager, and Automation Engine remain perfectly phase-locked (UDE resolved).

## Phase 4 & 5: Transition Tree (TT) & Action Plan

1. **Objective:** Update contracts.
   - **Action:** Update `IEngineTicker` registration methods to accept `divider` instead of `interval` (milliseconds).
2. **Objective:** Refactor core scheduling logic.
   - **Action:** Update `EngineTicker` to maintain a `currentTick` integer counter. Update the `tick` method to increment `currentTick` and evaluate `currentTick % task.divider === 0` instead of using time accumulators.
3. **Objective:** Migrate existing systems.
   - **Action:** Update all systems registering with `EngineTicker` (e.g., AutomationEngine, AudioBusSystem) to provide an integer divider based on their intended update frequency.
