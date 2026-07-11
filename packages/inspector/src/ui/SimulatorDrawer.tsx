// oxlint-disable max-lines-per-function
// noinspection D

import React, { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { useCommandTransmitter } from '../hooks/useCommandTransmitter';
import type { IEngineManifestDTO } from '../types/ManifestDTO';
import type { EventId, GameParamId, SoundId } from '@scene-grid/shared';

interface SimulatorDrawerProps {
    manifest: IEngineManifestDTO;
    onClose: () => void;
}

export const SimulatorDrawer: React.FC<SimulatorDrawerProps> = ({ manifest, onClose }) => {
    const { sendCommand } = useCommandTransmitter();
    const [rtpcValues, setRtpcValues] = useState<Record<string, number>>({});
    const [activeRtpcs, setActiveRtpcs] = useState<Set<string>>(new Set());
    const [switchValues, setSwitchValues] = useState<Record<string, string>>({});
    const [activeSwitches, setActiveSwitches] = useState<Set<string>>(new Set());
    const events = useMemo(() => Object.keys(manifest.events || {}), [manifest]);

    const rtpcs = useMemo(() => {
        return Object.entries(manifest.rtpcManifest || {}).map(([id, cfg]) => ({
            id,
            defaultValue: cfg.defaultValue ?? 0
        }));
    }, [manifest]);

    const switches = useMemo(() => {
        const switchNodes: Array<{ id: string; keys: string[] }> = [];
        Object.entries(manifest.soundMap || {}).forEach(([id, cfg]) => {
            if (cfg && typeof cfg === 'object' && 'switches' in cfg) {
                switchNodes.push({
                    id,
                    keys: Object.keys((cfg as any).switches)
                });
            }
        });
        return switchNodes;
    }, [manifest]);

    const handleFireEvent = (eventId: string) => {
        sendCommand({ type: 'FIRE_EVENT', timestampMs: Date.now(), eventId: eventId as EventId });
    };

    const handleGlobalAction = (action: 'STOP_ALL' | 'PAUSE_ALL' | 'RESUME_ALL') => {
        sendCommand({ type: 'GLOBAL_ACTION', timestampMs: Date.now(), action });
    };

    const handleClearAll = () => {
        sendCommand({ type: 'CLEAR_ALL_OVERRIDES', timestampMs: Date.now() });
        setActiveRtpcs(new Set());
        setActiveSwitches(new Set());
    };

    const handleRtpcOverride = (param: string, value: number, isOverride: boolean) => {
        sendCommand({
            type: 'SET_RTPC',
            timestampMs: Date.now(),
            param: param as GameParamId,
            value,
            isOverride
        });
    };

    const handleSwitchOverride = (switchId: string, currentKey: string, isOverride: boolean) => {
        sendCommand({
            type: 'SET_SWITCH',
            timestampMs: Date.now(),
            switchId: switchId as SoundId,
            currentKey,
            isOverride
        });
    };

    return (
        <div className="absolute top-10 right-0 w-[400px] h-[calc(100vh-40px)] bg-surface border-l border-border shadow-2xl z-40 flex flex-col overflow-hidden">
            <div className="flex-none h-10 bg-surface-hover/50 border-b border-border flex items-center justify-between px-4">
                <span className="font-bold text-foreground tracking-wider uppercase text-[11px]">
                    What-If Simulator
                </span>
                <button onClick={onClose} className="text-foreground-muted hover:text-foreground">
                    ✕
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* GLOBAL TRANSPORT */}
                <section>
                    <div className="text-[10px] uppercase text-foreground-muted font-bold mb-2 flex justify-between">
                        <span>Global Transport</span>
                        <button onClick={handleClearAll} className="text-danger hover:underline">
                            Clear Overrides
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                handleGlobalAction('STOP_ALL');
                            }}
                            className="flex-1 py-1.5 bg-danger/20 hover:bg-danger/30 text-danger border border-danger/50 rounded font-bold"
                        >
                            STOP ALL
                        </button>
                        <button
                            onClick={() => {
                                handleGlobalAction('PAUSE_ALL');
                            }}
                            className="flex-1 py-1.5 bg-warning/20 hover:bg-warning/30 text-warning border border-warning/50 rounded font-bold"
                        >
                            PAUSE
                        </button>
                        <button
                            onClick={() => {
                                handleGlobalAction('RESUME_ALL');
                            }}
                            className="flex-1 py-1.5 bg-success/20 hover:bg-success/30 text-success border border-success/50 rounded font-bold"
                        >
                            RESUME
                        </button>
                    </div>
                </section>

                {/* EVENTS */}
                {events.length > 0 && (
                    <section>
                        <div className="text-[10px] uppercase text-foreground-muted font-bold mb-2">Events</div>
                        <div className="grid grid-cols-2 gap-2">
                            {events.map(ev => (
                                <button
                                    key={ev}
                                    onClick={() => {
                                        handleFireEvent(ev);
                                    }}
                                    className="px-2 py-1.5 bg-surface-active hover:bg-surface-hover border border-border rounded text-left truncate text-foreground transition-colors"
                                    title={ev}
                                >
                                    ⚡ {ev}
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* RTPC OVERRIDES */}
                {rtpcs.length > 0 && (
                    <section>
                        <div className="text-[10px] uppercase text-foreground-muted font-bold mb-2">RTPC Overrides</div>
                        <div className="space-y-2">
                            {rtpcs.map(rtpc => {
                                const isActive = activeRtpcs.has(rtpc.id);
                                const val = rtpcValues[rtpc.id] ?? rtpc.defaultValue;

                                return (
                                    <div
                                        key={rtpc.id}
                                        className={clsx(
                                            'p-2 border rounded flex items-center gap-3',
                                            isActive
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border/50 bg-surface-active'
                                        )}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isActive}
                                            onChange={e => {
                                                const checked = e.target.checked;
                                                const newSet = new Set(activeRtpcs);
                                                // oxlint-disable-next-line no-unused-expressions
                                                checked ? newSet.add(rtpc.id) : newSet.delete(rtpc.id);
                                                setActiveRtpcs(newSet);
                                                handleRtpcOverride(rtpc.id, val, checked);
                                            }}
                                            className="w-4 h-4 cursor-pointer"
                                        />
                                        <span className="flex-1 truncate" title={rtpc.id}>
                                            {rtpc.id}
                                        </span>
                                        <input
                                            type="number"
                                            value={val}
                                            onChange={e => {
                                                const newVal = parseFloat(e.target.value) || 0;
                                                setRtpcValues(prev => ({ ...prev, [rtpc.id]: newVal }));
                                                if (isActive) handleRtpcOverride(rtpc.id, newVal, true);
                                            }}
                                            className="w-20 px-1 py-0.5 bg-background border border-border rounded text-right"
                                            disabled={!isActive}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* SWITCH OVERRIDES */}
                {switches.length > 0 && (
                    <section>
                        <div className="text-[10px] uppercase text-foreground-muted font-bold mb-2">
                            Switch Overrides
                        </div>
                        <div className="space-y-2">
                            {switches.map(sw => {
                                const isActive = activeSwitches.has(sw.id);
                                const val = switchValues[sw.id] ?? sw.keys[0] ?? '';

                                return (
                                    <div
                                        key={sw.id}
                                        className={clsx(
                                            'p-2 border rounded flex items-center gap-3',
                                            isActive
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border/50 bg-surface-active'
                                        )}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isActive}
                                            onChange={e => {
                                                const checked = e.target.checked;
                                                const newSet = new Set(activeSwitches);
                                                // oxlint-disable-next-line no-unused-expressions
                                                checked ? newSet.add(sw.id) : newSet.delete(sw.id);
                                                setActiveSwitches(newSet);
                                                handleSwitchOverride(sw.id, val, checked);
                                            }}
                                            className="w-4 h-4 cursor-pointer"
                                        />
                                        <span className="flex-1 truncate" title={sw.id}>
                                            {sw.id}
                                        </span>
                                        <select
                                            value={val}
                                            onChange={e => {
                                                const newVal = e.target.value;
                                                setSwitchValues(prev => ({ ...prev, [sw.id]: newVal }));
                                                if (isActive) handleSwitchOverride(sw.id, newVal, true);
                                            }}
                                            className="w-28 px-1 py-0.5 bg-background border border-border rounded outline-none"
                                            disabled={!isActive}
                                        >
                                            {sw.keys.map(k => (
                                                <option key={k} value={k}>
                                                    {k}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};
