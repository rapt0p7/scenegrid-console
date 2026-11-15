// oxlint-disable max-lines-per-function
// noinspection D

import type { ITelemetrySnapshot } from '@scene-grid/shared';

import React, { useEffect, useRef, useState } from 'react';
// oxlint-disable-next-line import/no-unassigned-import
import 'uplot/dist/uPlot.min.css';
import uPlot from 'uplot';

interface Props {
    snapshotRef: React.MutableRefObject<ITelemetrySnapshot | null>;
}

const HISTORY_SIZE = 300;

const toTranslucent = (color: string, alpha = 0.2): string => {
    const trimmed = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        const a = Math.round(alpha * 255)
            .toString(16)
            .padStart(2, '0');
        return `${trimmed}${a}`;
    }
    const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
        return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
    }
    return trimmed;
};

const readChartPalette = (el: HTMLElement) => {
    const styles = getComputedStyle(el);
    const getVar = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
    const total = getVar('--color-chart-total-voices', '#4fd6e0');
    const virtual = getVar('--color-chart-virtual-voices', '#f5b800');
    return {
        axisLabel: getVar('--color-chart-axis-label', '#ababa5'),
        gridline: getVar('--color-chart-gridline', '#2a2a27'),
        total,
        totalFill: toTranslucent(total, 0.2),
        virtual,
        virtualFill: toTranslucent(virtual, 0.2)
    };
};

export const PerformanceGraph: React.FC<Props> = ({ snapshotRef }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const plotRef = useRef<uPlot | null>(null);
    const dataRef = useRef<[Float32Array, Float32Array, Float32Array] | null>(null);
    const [themeTick, setThemeTick] = useState(0);

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setThemeTick(t => t + 1);
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme', 'style']
        });
        if (document.body) {
            observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
        }
        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

        if (!dataRef.current) {
            const init = [
                new Float32Array(HISTORY_SIZE),
                new Float32Array(HISTORY_SIZE),
                new Float32Array(HISTORY_SIZE)
            ] as [Float32Array, Float32Array, Float32Array];
            const now = performance.now() / 1000;
            for (let i = 0; i < HISTORY_SIZE; i++) {
                init[0][i] = now - (HISTORY_SIZE - i) * (1 / 60);
            }
            dataRef.current = init;
        }

        const data = dataRef.current;
        const palette = readChartPalette(containerRef.current);

        const opts: uPlot.Options = {
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
            axes: [
                { show: false },
                {
                    stroke: palette.axisLabel,
                    grid: { stroke: palette.gridline },
                    values: (u, splits) => splits.map(v => (Number.isInteger(v) ? v : ''))
                }
            ],
            series: [
                {},
                {
                    label: 'Total',
                    stroke: palette.total,
                    fill: palette.totalFill,
                    width: 2,
                    value: (u, v) => (v == null ? data[1][HISTORY_SIZE - 1].toFixed(0) : v.toFixed(0))
                },
                {
                    label: 'Virtual',
                    stroke: palette.virtual,
                    fill: palette.virtualFill,
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

        plotRef.current = new uPlot(opts, data, containerRef.current);

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

                plotRef.current.setData(data);
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
    }, [snapshotRef, themeTick]);

    return <div ref={containerRef} className="h-full w-full bg-[var(--color-bg-chart)] text-foreground" />;
};
