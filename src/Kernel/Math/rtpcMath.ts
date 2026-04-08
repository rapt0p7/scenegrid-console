// noinspection D

import type { MathCurveDefinition } from '@kernel/Math/curves.js';

// eslint-disable-next-line complexity
export function evaluateRTPCCurve(inputValue: number, curve: MathCurveDefinition): number {
    if (!curve) return 0;

    // Поддержка массива точек (Piecewise Linear)
    if (Array.isArray(curve)) {
        if (curve.length === 0) return 0;
        if (curve.length === 1) return curve[0].y;

        // eslint-disable-next-line unicorn/no-array-sort
        const sorted = [...curve].sort((a, b) => a.x - b.x);

        const firstPoint = sorted[0];
        // eslint-disable-next-line unicorn/prefer-at
        const lastPoint = sorted[sorted.length - 1];

        if (inputValue <= firstPoint.x) return firstPoint.y;
        if (inputValue >= lastPoint.x) return lastPoint.y;

        for (let index = 0; index < sorted.length - 1; index++) {
            const p1 = sorted[index];
            const p2 = sorted[index + 1];
            if (inputValue >= p1.x && inputValue <= p2.x) {
                const t = (inputValue - p1.x) / (p2.x - p1.x);
                return p1.y + t * (p2.y - p1.y);
            }
        }
        return 0;
    }

    const { type, minX, maxX, minY, maxY } = curve;

    if (inputValue <= minX) return minY;
    if (inputValue >= maxX) return maxY;

    const t = (inputValue - minX) / (maxX - minX);
    let eased = t;

    switch (type) {
        case 'linear': {
            eased = t;
            break;
        }
        case 'logarithmic': {
            eased = Math.log10(1 + 9 * t);
            break;
        }
        case 'exponential': {
            eased = t * t;
            break;
        }
        case 's-curve': {
            eased = t * t * (3 - 2 * t);
            break;
        }
    }

    return minY + eased * (maxY - minY);
}
