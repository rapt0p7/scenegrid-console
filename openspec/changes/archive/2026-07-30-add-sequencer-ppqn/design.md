# Design: Sequencer PPQN

## Control-Plane Structures (Ports & Configuration)

### 1. `IAudioEngineConfig` (Application)
Expand configuration to provide the global PPQN.
```typescript
export interface IAudioEngineConfig {
    readonly sequencer?: {
        readonly ppqn?: 96 | 192 | 480 | 960; // Defaults to 960
    };
}
```

### 2. `QuantizeType` (Domain/Shared)
Expand quantization types to support precise grids.
```typescript
export type QuantizeType = 
    | 'Immediate'
    | 'NextBar'
    | 'NextBeat'
    | { type: 'NextGridDivision', division: '1/4' | '1/8' | '1/16' | '1/32' }
    | { type: 'ExactPulse', pulseOffset: number };
```

### 3. `IAudioGrid` (Domain)
Update the Port to expose high-resolution math.
```typescript
export interface IAudioGrid {
    readonly ppqn: number;
    getNextBeatTime(currentTime: number, interval?: number): number;
    getNextBarTime(currentTime: number, interval?: number): number;
    getTimeAtPulse(pulseIndex: number): number;
    getPulseAtTime(currentTime: number): number;
}
```

## Data-Plane Mutations (Implementations)

### `AudioGrid.ts` Drift-Free Math
We must prevent floating-point accumulation drift over long durations.

**Implementation Strategy:**
Calculate exact float time from pure integer math on demand:
```typescript
public getTimeAtPulse(targetPulseIndex: number): number {
    // 1. Math in pure integers
    const numerator = 60 * targetPulseIndex;
    const denominator = this.#bpm * this.#ppqn;
    
    // 2. Only divide into a float at the very last step.
    const elapsedSeconds = numerator / denominator;
    
    return this.#startTime + elapsedSeconds;
}
```

### `Sequencer.ts` Transitions
`transitionTo` and `playStinger` logic will pattern match against the new `QuantizeType` structures, calculating absolute target times using the new `AudioGrid` pulse resolution methods.
