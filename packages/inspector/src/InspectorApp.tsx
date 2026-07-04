// oxlint-disable max-lines-per-function
// noinspection D

import React, { useState } from 'react';
import { RawLogger } from './ui/RawLogger.jsx';
import { PolyphonyCounter } from './ui/PolyphonyCounter.jsx';
import { PerformanceGraph } from './ui/PerformanceGraph.jsx';
import { useTelemetryBus } from './hooks/useTelemetryBus.js';
import { AudioGraph } from './ui/AudioGraph/AudioGraph.js';
import { useSnapshotTimeline } from './hooks/useSnapshotTimeline';
import { TimelineScrubber } from './ui/TimelineScrubber';
import { NodeInspector, type SelectedNodeInfo } from './ui/AudioGraph/NodeInspector.jsx';

export const InspectorApp: React.FC = () => {
    const { logs, latestSnapshot, manifest, consistencyReport } = useTelemetryBus();

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

    const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);
    const [isIssuesPanelOpen, setIsIssuesPanelOpen] = useState(false);

    const renderConsistencyStatus = () => {
        if (!consistencyReport) {
            return <span className="text-foreground-muted text-[10px] uppercase tracking-wider">Validating...</span>;
        }

        const errorCount = consistencyReport.errors.length;
        const warningCount = consistencyReport.warnings.length;

        if (errorCount === 0 && warningCount === 0) {
            return (
                <span
                    className="text-success cursor-pointer hover:text-success/80 transition-colors flex items-center gap-1"
                    onClick={() => {
                        setIsIssuesPanelOpen(!isIssuesPanelOpen);
                    }}
                >
                    ✓ Config OK
                </span>
            );
        }

        return (
            <div
                className="flex items-center gap-2 cursor-pointer hover:bg-surface-active px-2 py-1 rounded transition-colors"
                onClick={() => {
                    setIsIssuesPanelOpen(!isIssuesPanelOpen);
                }}
            >
                {errorCount > 0 && <span className="text-danger font-bold text-xs">🛑 {errorCount}</span>}
                {warningCount > 0 && <span className="text-warning font-bold text-xs">⚠️ {warningCount}</span>}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-screen w-screen bg-background text-foreground font-mono text-xs overflow-hidden select-none">
            <header className="flex-none h-10 bg-surface border-b border-border flex items-center justify-between px-4 relative">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-foreground tracking-wider">
                        SCENEGRID <span className="text-primary">INSPECTOR</span>
                    </span>
                    <div className="h-4 w-px bg-border" />
                    <span className="text-foreground-muted">
                        Polyphony: <PolyphonyCounter snapshotRef={displayRef} />
                    </span>
                </div>

                <div className="flex items-center gap-4">
                    {renderConsistencyStatus()}

                    <div className="h-4 w-px bg-border" />

                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                        </span>
                        <span className="text-success">Connected</span>
                    </div>
                </div>
                {isIssuesPanelOpen && consistencyReport && (
                    <div className="absolute top-[40px] right-4 w-[500px] max-h-[600px] bg-surface border border-border rounded-b shadow-2xl z-50 flex flex-col overflow-hidden">
                        <div className="flex-none bg-surface-hover/50 p-2 border-b border-border flex justify-between items-center">
                            <strong className="text-foreground tracking-wider uppercase text-[10px]">
                                Config Consistency Issues
                            </strong>
                            <button
                                onClick={() => {
                                    setIsIssuesPanelOpen(false);
                                }}
                                className="text-foreground-muted hover:text-foreground hover:bg-surface-active px-2 rounded transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2 font-mono">
                            {consistencyReport.errors.map((err, i) => (
                                <div
                                    key={`err-${i}`}
                                    className="p-2 bg-danger/10 border border-danger/30 rounded text-danger text-[11px] leading-tight flex items-start gap-2"
                                >
                                    <span className="font-bold mt-0.5">ERR</span>
                                    <span>{err}</span>
                                </div>
                            ))}
                            {consistencyReport.warnings.map((warn, i) => (
                                <div
                                    key={`warn-${i}`}
                                    className="p-2 bg-warning/10 border border-warning/30 rounded text-warning text-[11px] leading-tight flex items-start gap-2"
                                >
                                    <span className="font-bold mt-0.5">WARN</span>
                                    <span>{warn}</span>
                                </div>
                            ))}
                            {consistencyReport.isConsistent && consistencyReport.warnings.length === 0 && (
                                <div className="p-4 text-center text-success italic text-[11px]">
                                    No issues found. Engine configuration is perfect!
                                </div>
                            )}
                        </div>
                    </div>
                )}
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
                                <AudioGraph
                                    snapshotRef={displayRef}
                                    manifest={manifest}
                                    onNodeClick={setSelectedNode}
                                />
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
                <aside className="w-[300px] flex flex-col border-l border-border bg-background/50 relative shrink-0 transition-all">
                    <NodeInspector
                        snapshot={displayRef.current}
                        selectedNode={selectedNode}
                        onClose={() => {
                            setSelectedNode(null);
                        }}
                    />
                </aside>
            </div>
        </div>
    );
};
