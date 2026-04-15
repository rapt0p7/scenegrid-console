import type { Emitter } from 'mitt';

export type RTPCEvents = Record<string, number>;

export interface IRTPCManager {
    events: Emitter<RTPCEvents>;
    setValue(parameterName: string, value: number): void;
    setValues(parameters: Record<string, number>): void;
    getValue(parameterName: string, defaultValue?: number): number;
    configureParam(parameterName: string, attackMs: number, releaseMs: number): void;
    tick(deltaTimeMs: number): void;
    reset(): void;
}
