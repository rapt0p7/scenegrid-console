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
        <div className="flex items-center gap-4 p-2 bg-surface border-t border-border select-none">
            <button
                onClick={onResume}
                disabled={isLive}
                className={`px-3 py-1 rounded-sm text-xs font-bold transition-colors ${
                    isLive
                        ? 'bg-surface-active text-success opacity-50 cursor-not-allowed'
                        : 'bg-success text-primary-foreground hover:opacity-90 animate-pulse'
                }`}
            >
                {isLive ? 'LIVE' : 'RESUME'}
            </button>

            <div className="flex-1 flex items-center gap-2 relative">
                <span className="text-xs text-foreground-muted font-mono">-{bufferSize - 1 - currentIndex}f</span>

                <div className="flex-1 relative flex items-center h-8 group">
                    <div
                        className="absolute -top-8 px-2 py-1 bg-surface-active border border-border rounded text-[10px] font-mono text-primary pointer-events-none transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
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
                        className="w-full block cursor-ew-resize accent-primary"
                    />
                </div>

                <span className="text-xs text-foreground-muted font-mono">NOW</span>
            </div>
        </div>
    );
};
