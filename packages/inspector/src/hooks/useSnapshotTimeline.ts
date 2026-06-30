// oxlint-disable max-lines-per-function
// noinspection D

import { useRef, useCallback, useState, useEffect } from 'react';
import type { ITelemetrySnapshot } from '@scene-grid/shared';

const MAX_BUFFER_SIZE = 600;

export const useSnapshotTimeline = (latestSnapshotRef: React.MutableRefObject<ITelemetrySnapshot | null>) => {
    const bufferRef = useRef<ITelemetrySnapshot[]>([]);
    const displayRef = useRef<ITelemetrySnapshot | null>(latestSnapshotRef.current);

    const [isLive, setIsLive] = useState(true);
    const isLiveRef = useRef(true);

    const [bufferSize, setBufferSize] = useState(0);
    const [inspectedIndex, setInspectedIndex] = useState(0);
    const [exactInspectedTime, setExactInspectedTime] = useState<number | null>(null);

    useEffect(() => {
        if (!isLive) return;

        let frameId: number;
        let lastUiUpdateTime = 0;

        const sampleLoop = (time: DOMHighResTimeStamp) => {
            if (!isLiveRef.current) return;

            const snap = latestSnapshotRef.current;

            if (snap) {
                const lastInBuffer = bufferRef.current.at(-1);

                if (lastInBuffer && snap.timestampMs < lastInBuffer.timestampMs) {
                    bufferRef.current = [];
                }

                const currentLastInBuffer = bufferRef.current.at(-1);

                if (!currentLastInBuffer || currentLastInBuffer.timestampMs !== snap.timestampMs) {
                    if (bufferRef.current.length >= MAX_BUFFER_SIZE) {
                        bufferRef.current.shift();
                    }
                    bufferRef.current.push(snap);
                    displayRef.current = snap;

                    if (time - lastUiUpdateTime > 100) {
                        setBufferSize(bufferRef.current.length);
                        setInspectedIndex(bufferRef.current.length - 1);
                        lastUiUpdateTime = time;
                    }
                }
            }
            frameId = requestAnimationFrame(sampleLoop);
        };

        frameId = requestAnimationFrame(sampleLoop);
        // oxlint-disable-next-line typescript/consistent-return typescript/no-confusing-void-expression
        return () => cancelAnimationFrame(frameId);
    }, [isLive, latestSnapshotRef]);

    const pauseAndInspect = useCallback((targetTime: number) => {
        isLiveRef.current = false;
        setIsLive(false);
        setExactInspectedTime(targetTime);
        const buffer = bufferRef.current;

        let closestIndex = 0;
        let minDiff = Infinity;

        for (let i = 0; i < buffer.length; i++) {
            const diff = Math.abs((buffer[i].timestampMs || 0) - targetTime);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
        }

        setInspectedIndex(closestIndex);
        setBufferSize(buffer.length);
        displayRef.current = buffer[closestIndex];
    }, []);

    const scrubToIndex = useCallback((index: number) => {
        isLiveRef.current = false;
        setIsLive(false);
        setExactInspectedTime(null);
        if (bufferRef.current[index]) {
            setInspectedIndex(index);
            displayRef.current = bufferRef.current[index];
        }
    }, []);

    const resumeLive = useCallback(() => {
        isLiveRef.current = true;
        setIsLive(true);
        setExactInspectedTime(null);
        setBufferSize(bufferRef.current.length);
        setInspectedIndex(bufferRef.current.length - 1);
    }, []);

    return {
        displayRef,
        isLive,
        inspectedIndex,
        bufferSize,
        exactInspectedTime,
        pauseAndInspect,
        scrubToIndex,
        resumeLive
    };
};
