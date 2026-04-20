import type { BusId } from '@domain/Types/Branded';
import type { MathCurveDefinition, MathCurvePresetDefinition } from '@shared/Math/MathCurve';

export type RTPCTargetProperty = 'gain' | 'filterFrequency' | 'pan' | 'pitch' | 'sendLevel';

export interface RTPCPoint {
    readonly x: number;
    readonly y: number;
}

export type RTPCCurvePreset = MathCurvePresetDefinition;
export type RTPCCurveDefinition = MathCurveDefinition;
export interface IRTPCConfig {
    readonly gameParam: string;
    readonly curve: RTPCCurveDefinition | RTPCCurvePreset;
    readonly sendTargetBus?: BusId;
    readonly smoothingMs?: number;
}
