// oxlint-disable max-lines-per-function
// noinspection D

import React from 'react';
import { clsx } from 'clsx';
import type { ITelemetrySnapshot } from '@scene-grid/shared';

export type SelectedNodeInfo = { type: 'BUS'; id: string } | { type: 'PLAYBACK'; id: number };

interface NodeInspectorProps {
    snapshot: ITelemetrySnapshot | null;
    selectedNode: SelectedNodeInfo | null;
    onClose: () => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({ snapshot, selectedNode, onClose }) => {
    if (!selectedNode) {
        return (
            <div className="flex-1 flex items-center justify-center text-foreground-muted italic text-[10px] p-4 text-center">
                Select a node in the Audio Graph
                <br />
                to inspect its current state.
            </div>
        );
    }

    if (!snapshot) {
        return <div className="p-4 text-foreground-muted">No snapshot data available.</div>;
    }

    const renderBusState = (busId: string) => {
        const bus = snapshot.buses.find(b => b.busId === busId);
        if (!bus) return <div className="text-danger">Bus {busId} not found in snapshot.</div>;

        const isDeaf = bus.finalGain <= 0;

        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-foreground-muted">Final Gain</span>
                    <span className={clsx('font-bold text-lg', isDeaf ? 'text-danger' : 'text-success')}>
                        {bus.finalGain.toFixed(2)}
                    </span>
                </div>

                <div className="space-y-1">
                    <div className="text-[10px] uppercase text-foreground-muted font-bold mb-2">Gain Chain</div>
                    <div className="flex justify-between border-b border-border/50 py-1">
                        <span>Logical Gain</span>
                        <span className="text-info">{bus.logicalGain.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-1">
                        <span>RTPC Gain</span>
                        <span className="text-info">{bus.rtpcGain.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-1">
                        <span>Sidechain Gain</span>
                        <span className={clsx(bus.sidechainGain < 1 ? 'text-warning font-bold' : 'text-info')}>
                            {bus.sidechainGain.toFixed(2)}
                        </span>
                    </div>
                </div>

                {bus.modifiersCount > 0 && (
                    <div className="mt-4 space-y-2">
                        <div className="text-[10px] uppercase text-foreground-muted font-bold mb-2">
                            Active Modifiers
                        </div>
                        {bus.activeModifiers.slice(0, bus.modifiersCount).map((mod, idx) => (
                            <div key={idx} className="p-2 bg-surface-active border border-border/50 rounded-sm">
                                <div className="flex justify-between items-center mb-1">
                                    <span
                                        className={clsx(
                                            'text-[10px] font-bold',
                                            mod.type === 'SIDECHAIN' ? 'text-warning' : 'text-info'
                                        )}
                                    >
                                        {mod.type}
                                    </span>
                                    <span
                                        className={clsx('font-bold', mod.value < 1 ? 'text-danger' : 'text-foreground')}
                                    >
                                        x{mod.value.toFixed(2)}
                                    </span>
                                </div>
                                <div className="text-[10px] text-foreground-muted">{mod.source}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderPlaybackState = (playbackId: number) => {
        const playback = snapshot.activePlaybacks.find(p => p.playbackId === playbackId);
        if (!playback) return <div className="text-danger">Playback {playbackId} not found or inactive.</div>;

        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-foreground-muted">State</span>
                    <span
                        className={clsx(
                            'px-2 py-0.5 rounded-sm font-bold text-[10px]',
                            playback.isVirtual ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
                        )}
                    >
                        {playback.isVirtual ? 'VIRTUAL' : 'PHYSICAL'}
                    </span>
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between border-b border-border/50 py-1">
                        <span>Sound ID</span>
                        <span className="text-foreground">{playback.soundId}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-1">
                        <span>Volume</span>
                        <span className="text-info">{playback.volume.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-1">
                        <span>Position</span>
                        <span className="text-info">{playback.positionSec.toFixed(3)}s</span>
                    </div>
                </div>

                {playback.isVirtual && playback.virtualReason && (
                    <div className="mt-4 p-2 bg-warning/10 border border-warning/30 rounded-sm">
                        <div className="text-[10px] uppercase text-warning font-bold mb-1">Virtualization Reason</div>
                        <div className="text-foreground-muted">{playback.virtualReason}</div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-none h-8 bg-surface-hover/50 border-b border-border flex items-center justify-between px-3">
                <div className="text-foreground-muted font-semibold uppercase tracking-wider text-[10px] flex items-center gap-2">
                    <span>Node Inspector</span>
                    <span className="bg-surface-active px-1.5 py-0.5 rounded text-foreground">
                        {selectedNode.type} : {selectedNode.id}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="text-foreground-muted hover:text-foreground hover:bg-surface-active px-2 rounded transition-colors"
                >
                    ✕
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
                {selectedNode.type === 'BUS' ? renderBusState(selectedNode.id) : renderPlaybackState(selectedNode.id)}
            </div>
        </div>
    );
};
