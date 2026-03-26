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
