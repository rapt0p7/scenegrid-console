export interface Point2D {
    readonly x: number;
    readonly y: number;
}

export type MathCurveType = 'linear' | 'logarithmic' | 'exponential' | 's-curve';

export interface MathCurvePresetDefinition {
    readonly type: MathCurveType;
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
}

export type MathCurveDefinition = ReadonlyArray<Point2D> | MathCurvePresetDefinition;
