export interface Point2D {
    x: number;
    y: number;
}

export type MathCurveType = 'linear' | 'logarithmic' | 'exponential' | 's-curve';

export interface MathCurvePresetDefinition {
    type: MathCurveType;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export type MathCurveDefinition = Point2D[] | MathCurvePresetDefinition;

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
