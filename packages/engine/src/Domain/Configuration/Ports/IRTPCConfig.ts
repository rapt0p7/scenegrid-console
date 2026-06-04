import type { BusId, GameParamId, MathCurveDefinition, MathCurvePresetDefinition } from '@scene-grid/shared';

export type RTPCTargetProperty = 'gain' | 'filterFrequency' | 'pan' | 'pitch' | 'sendLevel';

export interface RTPCPoint {
    readonly x: number;
    readonly y: number;
}

export type RTPCCurvePreset = MathCurvePresetDefinition;
export type RTPCCurveDefinition = MathCurveDefinition;
export interface IRTPCConfig {
    readonly gameParam: GameParamId;
    readonly curve: RTPCCurveDefinition | RTPCCurvePreset;
    readonly sendTargetBus?: BusId;
    readonly smoothingMs?: number;
}
