import { bench, describe } from 'vitest';

import type { MathCurveDefinition } from '../MathCurve.js';

import { evaluateRTPCCurve } from '../rtpcMath.js';

describe('evaluateRTPCCurve: Piecewise Sort vs Parametric Presets', () => {
    const inputVal = 50;

    const presetCurve: MathCurveDefinition = {
        type: 's-curve',
        minX: 0,
        maxX: 100,
        minY: 0,
        maxY: 1.0
    };

    const piecewiseCurve: MathCurveDefinition = [
        { x: 100, y: 1.0 },
        { x: 0, y: 0 },
        { x: 50, y: 0.5 }
    ];

    bench('Parametric S-Curve Preset (O(1) Pure Math)', () => {
        evaluateRTPCCurve(inputVal, presetCurve);
    });

    bench('Piecewise Array with Runtime Sort (O(N log N) + Garbage Collector load)', () => {
        evaluateRTPCCurve(inputVal, piecewiseCurve);
    });
});
