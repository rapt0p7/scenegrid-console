// oxlint-disable max-lines-per-function
// noinspection D

import clsx from 'clsx';
import React, { useState } from 'react';

import { useSnapshotTimeline } from './hooks/useSnapshotTimeline';
import { useTelemetryBus } from './hooks/useTelemetryBus.js';
import { AudioGraph } from './ui/AudioGraph/AudioGraph.js';
import { NodeInspector, type SelectedNodeInfo } from './ui/AudioGraph/NodeInspector.jsx';
import { PerformanceGraph } from './ui/PerformanceGraph.jsx';
import { PolyphonyCounter } from './ui/PolyphonyCounter.jsx';
import { RawLogger } from './ui/RawLogger.jsx';
import { SimulatorDrawer } from './ui/SimulatorDrawer.js';
import { TimelineScrubber } from './ui/TimelineScrubber';

export const InspectorApp: React.FC = () => {
    const { logs, latestSnapshot, manifest, consistencyReport, ramReport } = useTelemetryBus();

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
    const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

    const renderConsistencyStatus = () => {
        if (!consistencyReport) {
            return <span className="text-[10px] tracking-wider text-foreground-muted uppercase">Validating...</span>;
        }

        const errorCount = consistencyReport.errors.length;
        const warningCount = consistencyReport.warnings.length;

        if (errorCount === 0 && warningCount === 0) {
            return (
                <span
                    className="flex cursor-pointer items-center gap-1 text-success transition-colors hover:text-success/80"
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
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-surface-active"
                onClick={() => {
                    setIsIssuesPanelOpen(!isIssuesPanelOpen);
                }}
            >
                {errorCount > 0 && <span className="text-xs font-bold text-danger">🛑 {errorCount}</span>}
                {warningCount > 0 && <span className="text-xs font-bold text-warning">⚠️ {warningCount}</span>}
            </div>
        );
    };

    const renderRamStatus = () => {
        if (!ramReport) {
            return <span className="text-[10px] tracking-wider text-foreground-muted uppercase">RAM: --</span>;
        }

        const current = ramReport.currentRamMb;
        const quota = ramReport.ramQuotaMb;

        if (!quota) {
            return (
                <span className="text-foreground-muted">
                    RAM: <span className="font-bold text-foreground">{current.toFixed(1)} MB</span>
                </span>
            );
        }

        const percentage = Math.min(100, Math.max(0, (current / quota) * 100));
        const quotaValue = quota === Number.MAX_SAFE_INTEGER ? '∞' : quota.toFixed(2);

        let barColor = 'bg-success';
        if (percentage > 85) barColor = 'bg-danger';
        else if (percentage > 70) barColor = 'bg-warning';

        return (
            <div className="flex items-center gap-2" title={`RAM Usage: ${current.toFixed(2)} / ${quotaValue} MB`}>
                <span className="text-[10px] tracking-wider text-foreground-muted uppercase">RAM:</span>
                <div className="flex w-28 flex-col gap-1">
                    <div className="flex justify-between text-[9px] leading-none">
                        <span className={clsx('font-bold', percentage > 85 ? 'text-danger' : 'text-foreground')}>
                            {current.toFixed(1)}
                        </span>
                        <span className="text-foreground-muted">{quotaValue} MB</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full border border-border bg-surface-active">
                        <div
                            className={clsx('h-full rounded-full transition-all duration-300 ease-out', barColor)}
                            style={{ width: `${percentage}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background font-mono text-xs text-foreground select-none">
            <header className="relative flex h-10 flex-none items-center justify-between border-b border-border bg-surface px-4">
                <div className="flex items-center gap-4">
                    <span className="font-bold tracking-wider text-foreground">
                        SCENEGRID <span className="text-primary">INSPECTOR</span>
                    </span>
                    <div className="h-4 w-px bg-border" />
                    <span className="text-foreground-muted">
                        Polyphony: <PolyphonyCounter snapshotRef={displayRef} />
                    </span>
                    <div className="h-4 w-px bg-border" />
                    {renderRamStatus()}
                </div>

                <div className="flex items-center gap-4">
                    {renderConsistencyStatus()}

                    <div className="h-4 w-px bg-border" />

                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
                        </span>
                        <span className="text-success">Connected</span>
                    </div>
                </div>
                {isIssuesPanelOpen && consistencyReport && (
                    <div className="absolute top-[40px] right-4 z-50 flex max-h-[600px] w-[500px] flex-col overflow-hidden rounded-b border border-border bg-surface shadow-2xl">
                        <div className="flex flex-none items-center justify-between border-b border-border bg-surface-hover/50 p-2">
                            <strong className="text-[10px] tracking-wider text-foreground uppercase">
                                Config Consistency Issues
                            </strong>
                            <button
                                onClick={() => {
                                    setIsIssuesPanelOpen(false);
                                }}
                                className="rounded px-2 text-foreground-muted transition-colors hover:bg-surface-active hover:text-foreground"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex-1 space-y-2 overflow-y-auto p-2 font-mono">
                            {consistencyReport.errors.map((err, i) => (
                                <div
                                    key={`err-${i}`}
                                    className="flex items-start gap-2 rounded border border-danger/30 bg-danger/10 p-2 text-[11px] leading-tight text-danger"
                                >
                                    <span className="mt-0.5 font-bold">ERR</span>
                                    <span>{err}</span>
                                </div>
                            ))}
                            {consistencyReport.warnings.map((warn, i) => (
                                <div
                                    key={`warn-${i}`}
                                    className="flex items-start gap-2 rounded border border-warning/30 bg-warning/10 p-2 text-[11px] leading-tight text-warning"
                                >
                                    <span className="mt-0.5 font-bold">WARN</span>
                                    <span>{warn}</span>
                                </div>
                            ))}
                            {consistencyReport.isConsistent && consistencyReport.warnings.length === 0 && (
                                <div className="p-4 text-center text-[11px] text-success italic">
                                    No issues found. Engine configuration is perfect!
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <button
                    onClick={() => {
                        setIsSimulatorOpen(!isSimulatorOpen);
                    }}
                    className={clsx(
                        'rounded px-3 py-1 text-[10px] font-bold uppercase transition-colors',
                        isSimulatorOpen
                            ? 'bg-primary text-background'
                            : 'bg-surface-active text-foreground hover:bg-surface-hover'
                    )}
                >
                    Simulator
                </button>
            </header>

            {/* Main Content */}
            <div className="flex min-h-0 flex-1">
                {/* Sidebar */}
                <aside className="relative flex w-[450px] flex-col border-r border-border bg-background/50">
                    <div className="flex h-8 flex-none items-center border-b border-border bg-surface-hover/50 px-3 text-[10px] font-semibold tracking-wider text-foreground-muted uppercase">
                        Event Stream
                    </div>
                    <RawLogger
                        logs={logs}
                        onLogClick={pauseAndInspect}
                        isLive={isLive}
                        inspectedTime={exactInspectedTime ?? (isLive ? null : displayRef.current?.timestampMs)}
                    />
                </aside>

                {/* Workspace */}
                <main className="flex min-w-0 flex-1 flex-col">
                    <div className="relative flex flex-1 flex-col border-b border-border bg-surface-active/20">
                        <div className="flex h-8 flex-none items-center border-b border-border bg-surface-hover/50 px-3 text-[10px] font-semibold tracking-wider text-foreground-muted uppercase">
                            Performance & Polyphony
                        </div>
                        <div className="relative flex-1 overflow-hidden">
                            <PerformanceGraph snapshotRef={displayRef} />
                        </div>
                    </div>

                    <div className="relative flex flex-[1.5] flex-col bg-background">
                        <div className="flex h-8 flex-none items-center border-b border-border bg-surface-hover/50 px-3 text-[10px] font-semibold tracking-wider text-foreground-muted uppercase">
                            Routing & Mix State
                        </div>
                        <div className="relative flex-1">
                            {manifest ? (
                                <AudioGraph
                                    snapshotRef={displayRef}
                                    manifest={manifest}
                                    onNodeClick={setSelectedNode}
                                />
                            ) : (
                                <div className="absolute inset-0 flex animate-pulse items-center justify-center text-foreground-muted">
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
                <aside className="relative flex w-[300px] shrink-0 flex-col border-l border-border bg-background/50 transition-all">
                    <NodeInspector
                        snapshot={displayRef.current}
                        selectedNode={selectedNode}
                        onClose={() => {
                            setSelectedNode(null);
                        }}
                    />
                </aside>
            </div>
            {isSimulatorOpen && manifest && (
                <SimulatorDrawer
                    manifest={manifest}
                    snapshot={displayRef.current}
                    onClose={() => {
                        setIsSimulatorOpen(false);
                    }}
                />
            )}
        </div>
    );
};
