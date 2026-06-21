import React, { useEffect, useRef } from 'react';
import type { ITelemetrySnapshot } from '@scene-grid/shared';

interface Props {
    snapshotRef: React.MutableRefObject<ITelemetrySnapshot | null>;
}

export const PolyphonyCounter: React.FC<Props> = ({ snapshotRef }) => {
    const spanRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        let frameId: number;

        const loop = () => {
            if (spanRef.current) {
                const count = snapshotRef.current?.activePlaybacks?.length ?? 0;
                const currentText = spanRef.current.innerText;
                const newText = count.toString();

                if (currentText !== newText) {
                    spanRef.current.innerText = newText;
                }
            }
            frameId = requestAnimationFrame(loop);
        };

        frameId = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(frameId);
        };
    }, [snapshotRef]);

    return (
        <span ref={spanRef} className="text-zinc-300">
            0
        </span>
    );
};
