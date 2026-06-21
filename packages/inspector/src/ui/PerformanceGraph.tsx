// oxlint-disable max-lines-per-function
// noinspection D

import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';
// oxlint-disable-next-line import/no-unassigned-import
import 'uplot/dist/uPlot.min.css';
import type { ITelemetrySnapshot } from '@scene-grid/shared';

interface Props {
    snapshotRef: React.MutableRefObject<ITelemetrySnapshot | null>;
}

const HISTORY_SIZE = 300;

export const PerformanceGraph: React.FC<Props> = ({ snapshotRef }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const plotRef = useRef<uPlot | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const data = [new Float32Array(HISTORY_SIZE), new Float32Array(HISTORY_SIZE), new Float32Array(HISTORY_SIZE)];

        const now = performance.now() / 1000;
        for (let i = 0; i < HISTORY_SIZE; i++) {
            data[0][i] = now - (HISTORY_SIZE - i) * (1 / 60);
        }

        const opts: uPlot.Options = {
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
            axes: [
                { show: false },
                {
                    stroke: '#52525b',
                    grid: { stroke: '#27272a' },
                    values: (u, splits) => splits.map(v => (Number.isInteger(v) ? v : ''))
                }
            ],
            series: [
                {},
                {
                    label: 'Total',
                    stroke: '#3b82f6',
                    fill: '#3b82f633',
                    width: 2,
                    value: (u, v) => (v == null ? data[1][HISTORY_SIZE - 1].toFixed(0) : v.toFixed(0))
                },
                {
                    label: 'Virtual',
                    stroke: '#f59e0b',
                    fill: '#f59e0b33',
                    width: 2,
                    value: (u, v) => (v == null ? data[2][HISTORY_SIZE - 1].toFixed(0) : v.toFixed(0))
                }
            ],
            cursor: { show: false },
            scales: {
                x: { time: false },
                y: {
                    auto: false,
                    range: [0, 32]
                }
            }
        };

        plotRef.current = new uPlot(opts, data as unknown as uPlot.AlignedData, containerRef.current);

        let frameId: number;
        const loop = () => {
            if (plotRef.current) {
                const snapshot = snapshotRef.current;
                const currentTime = performance.now() / 1000;

                let total = 0;
                let virtual = 0;

                if (snapshot) {
                    total = snapshot.activePlaybacks.length;
                    // oxlint-disable-next-line array-callback-return
                    virtual = snapshot.activePlaybacks.reduce((acc, p) => acc + (p.isVirtual ? 1 : 0), 0);
                }

                data[0].copyWithin(0, 1, HISTORY_SIZE);
                data[1].copyWithin(0, 1, HISTORY_SIZE);
                data[2].copyWithin(0, 1, HISTORY_SIZE);

                data[0][HISTORY_SIZE - 1] = currentTime;
                data[1][HISTORY_SIZE - 1] = total;
                data[2][HISTORY_SIZE - 1] = virtual;

                plotRef.current.setData(data as unknown as uPlot.AlignedData);
            }
            frameId = requestAnimationFrame(loop);
        };

        frameId = requestAnimationFrame(loop);

        const handleResize = () => {
            if (plotRef.current && containerRef.current) {
                plotRef.current.setSize({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                });
            }
        };
        window.addEventListener('resize', handleResize);

        // oxlint-disable-next-line typescript/consistent-return
        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener('resize', handleResize);
            plotRef.current?.destroy();
        };
    }, [snapshotRef]);

    return <div ref={containerRef} className="w-full h-full" />;
};
