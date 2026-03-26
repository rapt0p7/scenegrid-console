import type { MathCurveDefinition, MathCurvePresetDefinition } from '../types/curves';
import type { Emitter } from 'mitt';

export type RTPCTargetProperty = 'gain' | 'filterFrequency' | 'pan' | 'pitch' | 'sendLevel';

export interface RTPCPoint {
    x: number;
    y: number;
}

export type RTPCCurvePreset = MathCurvePresetDefinition;
export type RTPCCurveDefinition = MathCurveDefinition;
export interface IRTPCConfig {
    gameParam: string;
    curve: RTPCCurveDefinition | RTPCCurvePreset;
    sendTargetBus?: string;
    smoothingMs?: number;
}

export type RTPCEvents = Record<string, number>;

export interface IRTPCManager {
    events: Emitter<RTPCEvents>;
    setValue(parameterName: string, value: number): void;
    setValues(parameters: Record<string, number>): void;
    getValue(parameterName: string, defaultValue?: number): number;
    configureParam(parameterName: string, attackMs: number, releaseMs: number): void;
    reset(): void;
}
