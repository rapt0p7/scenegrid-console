export function evaluateRTPCCurve(
    gameValue: number,
    curve: Array<{
        x: number;
        y: number;
    }>
): number {
    if (!curve || curve.length === 0) return 0;
    if (curve.length === 1) return curve[0].y;

    const sorted = [...curve].sort((a, b) => a.x - b.x);

    const firstPoint = sorted[0];
    // eslint-disable-next-line unicorn/prefer-at
    const lastPoint = sorted[sorted.length - 1];

    if (gameValue <= firstPoint.x) return firstPoint.y;
    if (gameValue >= lastPoint.x) return lastPoint.y;

    for (let index = 0; index < sorted.length - 1; index++) {
        const p1 = sorted[index];
        const p2 = sorted[index + 1];
        if (gameValue >= p1.x && gameValue <= p2.x) {
            const t = (gameValue - p1.x) / (p2.x - p1.x);
            return p1.y + t * (p2.y - p1.y);
        }
    }
    return 0;
}
