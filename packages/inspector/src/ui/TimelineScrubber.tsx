// oxlint-disable max-lines-per-function
import React from 'react';

interface TimelineScrubberProps {
    isLive: boolean;
    currentIndex: number;
    bufferSize: number;
    currentTimeMs: number;
    onScrub: (index: number) => void;
    onResume: () => void;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
    isLive,
    currentIndex,
    bufferSize,
    currentTimeMs,
    onScrub,
    onResume
}) => {
    const percentage = bufferSize > 1 ? (currentIndex / (bufferSize - 1)) * 100 : 0;

    return (
        <div className="flex items-center gap-4 border-t border-border bg-surface p-2 select-none">
            <button
                onClick={onResume}
                disabled={isLive}
                className={`rounded-sm px-3 py-1 text-xs font-bold transition-colors ${
                    isLive
                        ? 'cursor-not-allowed bg-surface-active text-success opacity-50'
                        : 'animate-pulse bg-success text-black hover:opacity-90'
                }`}
            >
                {isLive ? 'LIVE' : 'RESUME'}
            </button>

            <div className="relative flex flex-1 items-center gap-2">
                <span className="font-mono text-xs text-foreground-muted">-{bufferSize - 1 - currentIndex}f</span>

                <div className="group relative flex h-8 flex-1 items-center">
                    <div
                        className="pointer-events-none absolute -top-8 -translate-x-1/2 transform rounded border border-border bg-surface-active px-2 py-1 font-mono text-[10px] text-primary opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ left: `${percentage}%` }}
                    >
                        {currentTimeMs.toFixed(0)}ms
                    </div>

                    <input
                        type="range"
                        min={0}
                        max={Math.max(0, bufferSize - 1)}
                        value={currentIndex}
                        onChange={e => {
                            onScrub(Number(e.target.value));
                        }}
                        disabled={bufferSize === 0}
                        className="block w-full cursor-ew-resize accent-primary"
                    />
                </div>

                <span className="font-mono text-xs text-foreground-muted">NOW</span>
            </div>
        </div>
    );
};
