import type { Emitter } from 'mitt';

export type RTPCTargetProperty = 'gain' | 'filterFrequency' | 'pan' | 'pitch' | 'sendLevel';

export interface RTPCPoint {
    x: number;
    y: number;
}

export interface IRTPCConfig {
    gameParam: string;
    curve: RTPCPoint[];
    sendTargetBus?: string;
    smoothingMs?: number;
}

export type RTPCEvents = Record<string, number>;

export interface IRTPCManager {
    events: Emitter<RTPCEvents>;
    setValue(parameterName: string, value: number): void;
    setValues(parameters: Record<string, number>): void;
    getValue(parameterName: string, defaultValue?: number): number;
    reset(): void;
}
