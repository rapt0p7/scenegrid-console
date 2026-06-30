// oxlint-disable max-lines-per-function
import React from 'react';
import { RawLogger } from './ui/RawLogger.jsx';
import { PolyphonyCounter } from './ui/PolyphonyCounter.jsx';
import { PerformanceGraph } from './ui/PerformanceGraph.jsx';
import { useTelemetryBus } from './hooks/useTelemetryBus.js';
import { AudioGraph } from './ui/AudioGraph/AudioGraph.js';
import { useSnapshotTimeline } from './hooks/useSnapshotTimeline';
import { TimelineScrubber } from './ui/TimelineScrubber';

export const InspectorApp: React.FC = () => {
    const { logs, latestSnapshot, manifest } = useTelemetryBus();

    const {
        displayRef,
        isLive,
        inspectedIndex,
        bufferSize,
        exactInspectedTime,
        pauseAndInspect,
        scrubToIndex,
        resumeLive
    } = useSnapshotTimeline(latestSnapshot);

    return (
        <div className="flex flex-col h-screen w-screen bg-background text-foreground font-mono text-xs overflow-hidden select-none">
            {/* Header */}
            <header className="flex-none h-10 bg-surface border-b border-border flex items-center justify-between px-4">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-foreground tracking-wider">
                        SCENEGRID <span className="text-primary">INSPECTOR</span>
                    </span>
                    <div className="h-4 w-px bg-border" />
                    <span className="text-foreground-muted">
                        Polyphony: <PolyphonyCounter snapshotRef={displayRef} />
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                        </span>
                        <span className="text-success">Connected</span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex min-h-0">
                {/* Sidebar */}
                <aside className="w-[450px] flex flex-col border-r border-border bg-background/50 relative">
                    <div className="flex-none h-8 bg-surface-hover/50 border-b border-border flex items-center px-3 text-foreground-muted font-semibold uppercase tracking-wider text-[10px]">
                        Event Stream
                    </div>
                    <RawLogger
                        logs={logs}
                        onLogClick={pauseAndInspect}
                        isLive={isLive}
                        inspectedTime={exactInspectedTime ?? (!isLive ? displayRef.current?.timestampMs : null)}
                    />
                </aside>

                {/* Workspace */}
                <main className="flex-1 flex flex-col min-w-0">
                    <div className="flex-1 flex flex-col border-b border-border relative bg-surface-active/20">
                        <div className="flex-none h-8 bg-surface-hover/50 border-b border-border flex items-center px-3 text-foreground-muted font-semibold uppercase tracking-wider text-[10px]">
                            Performance & Polyphony
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                            <PerformanceGraph snapshotRef={displayRef} />
                        </div>
                    </div>

                    <div className="flex-[1.5] flex flex-col relative bg-background">
                        <div className="flex-none h-8 bg-surface-hover/50 border-b border-border flex items-center px-3 text-foreground-muted font-semibold uppercase tracking-wider text-[10px]">
                            Routing & Mix State
                        </div>
                        <div className="flex-1 relative">
                            {manifest ? (
                                <AudioGraph snapshotRef={displayRef} manifest={manifest} />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-foreground-muted animate-pulse">
                                    Waiting for Engine Manifest...
                                </div>
                            )}
                        </div>

                        <TimelineScrubber
                            isLive={isLive}
                            currentIndex={inspectedIndex}
                            currentTimeMs={displayRef.current?.timestampMs ?? 0}
                            bufferSize={bufferSize}
                            onScrub={scrubToIndex}
                            onResume={resumeLive}
                        />
                    </div>
                </main>
            </div>
        </div>
    );
};
