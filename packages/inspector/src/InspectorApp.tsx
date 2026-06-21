// oxlint-disable max-lines-per-function
import React from 'react';
import { RawLogger } from './ui/RawLogger.jsx';
import { PolyphonyCounter } from './ui/PolyphonyCounter.jsx';
import { PerformanceGraph } from './ui/PerformanceGraph.jsx';
import { useTelemetryBus } from './hooks/useTelemetryBus.js';
import { AudioGraph } from './ui/AudioGraph/AudioGraph.js';

export const InspectorApp: React.FC = () => {
    const { logs, latestSnapshot, manifest } = useTelemetryBus();

    return (
        <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-300 font-mono text-xs overflow-hidden select-none">
            {/* --- HEADER --- */}
            <header className="flex-none h-10 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-zinc-100 tracking-wider">
                        SCENEGRID <span className="text-blue-500">INSPECTOR</span>
                    </span>
                    <div className="h-4 w-px bg-zinc-700" />
                    <span className="text-zinc-500">
                        Polyphony: <PolyphonyCounter snapshotRef={latestSnapshot} />
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-emerald-500">Connected</span>
                    </div>
                </div>
            </header>

            {/* --- WORKSPACE --- */}
            <div className="flex-1 flex min-h-0">
                {/* LEFT PANEL: Event Logger */}
                <aside className="w-[450px] flex flex-col border-r border-zinc-800 bg-zinc-950/50 relative">
                    <div className="flex-none h-8 bg-zinc-900/50 border-b border-zinc-800 flex items-center px-3 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                        Event Stream
                    </div>
                    <RawLogger logs={logs} />
                </aside>

                {/* RIGHT PANEL: Visualizers */}
                <main className="flex-1 flex flex-col min-w-0">
                    {/* TOP: Profiler / uPlot */}
                    <div className="flex-1 flex flex-col border-b border-zinc-800 relative bg-zinc-900/20">
                        <div className="flex-none h-8 bg-zinc-900/50 border-b border-zinc-800 flex items-center px-3 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                            Performance & Polyphony
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                            <PerformanceGraph snapshotRef={latestSnapshot} />
                        </div>
                    </div>

                    {/* BOTTOM: Audio Graph / Litegraph */}
                    <div className="flex-[1.5] flex flex-col relative bg-zinc-950">
                        <div className="flex-none h-8 bg-zinc-900/50 border-b border-zinc-800 flex items-center px-3 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                            Routing & Mix State
                        </div>
                        <div className="flex-1 relative">
                            {manifest ? (
                                <AudioGraph snapshotRef={latestSnapshot} manifest={manifest} />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-zinc-500 animate-pulse">
                                    Waiting for Engine Manifest...
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};
