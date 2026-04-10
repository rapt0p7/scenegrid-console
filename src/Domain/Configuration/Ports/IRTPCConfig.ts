import type { BusId } from '@domain/Types/Branded';
import type { MathCurveDefinition, MathCurvePresetDefinition } from '@shared/Math/MathCurve';

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
    sendTargetBus?: BusId;
    smoothingMs?: number;
}
