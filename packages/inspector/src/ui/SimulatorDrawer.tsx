// oxlint-disable max-lines-per-function
// noinspection D

import React, { useState, useMemo, useEffect } from 'react';
import { clsx } from 'clsx';
import { useCommandTransmitter } from '../hooks/useCommandTransmitter';
import type { IEngineManifestDTO } from '../types/ManifestDTO';
import type { EventId, GameParamId, SoundId, ITelemetrySnapshot, RegionId } from '@scene-grid/shared';

interface SimulatorDrawerProps {
    manifest: IEngineManifestDTO;
    snapshot: ITelemetrySnapshot | null;
    onClose: () => void;
}

export const SimulatorDrawer: React.FC<SimulatorDrawerProps> = ({ manifest, snapshot, onClose }) => {
    const { sendCommand } = useCommandTransmitter();
    const [rtpcValues, setRtpcValues] = useState<Record<string, number>>({});
    const [activeRtpcs, setActiveRtpcs] = useState<Set<string>>(new Set());
    const [switchValues, setSwitchValues] = useState<Record<string, string>>({});
    const [activeSwitches, setActiveSwitches] = useState<Set<string>>(new Set());

    const musicConfigs = useMemo(() => {
        const list: Array<{ id: string; regions: string[]; bpm: number }> = [];
        Object.entries(manifest.soundMap || {}).forEach(([id, cfg]) => {
            if (cfg && typeof cfg === 'object' && 'smartLoop' in cfg) {
                const sl = (cfg as any).smartLoop;
                list.push({
                    id,
                    regions: Object.keys(sl.regions || {}),
                    bpm: sl.bpm ?? 120
                });
            }
        });
        return list;
    }, [manifest]);

    const [loopSoundId, setLoopSoundId] = useState<string>(musicConfigs[0]?.id || '');

    const currentTrackConfig = useMemo(() => {
        return musicConfigs.find(t => t.id === loopSoundId);
    }, [musicConfigs, loopSoundId]);

    const regions = currentTrackConfig?.regions || [];

    const [loopRegion, setLoopRegion] = useState<string>('');
    const [targetRegion, setTargetRegion] = useState<string>('');
    const [transitionRegion, setTransitionRegion] = useState<string>('');

    const [quantize, setQuantize] = useState<'Immediate' | 'NextBeat' | 'NextBar'>('NextBar');
    const [quantizeInterval, setQuantizeInterval] = useState<number>(1);
    const [blendMode, setBlendMode] = useState<'overlap' | 'crossfade'>('crossfade');
    const [crossfadeSec, setCrossfadeSec] = useState<number>(1.0);
    const [interruptable, setInterruptable] = useState<boolean>(true);

    useEffect(() => {
        if (regions.length > 0) {
            setLoopRegion(regions[0]);
            setTargetRegion(regions[0]);
            setTransitionRegion('');
        } else {
            setLoopRegion('');
            setTargetRegion('');
            setTransitionRegion('');
        }
    }, [loopSoundId, regions]);

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

    const activeMusicTracks = snapshot?.musicTracks ?? [];
    const liveTrackState = activeMusicTracks.find(t => t.soundId === loopSoundId);

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

    const handlePlayLoop = () => {
        if (!loopSoundId || !loopRegion) return;
        // oxlint-disable-next-line typescript/no-explicit-any
        sendCommand({
            type: 'PLAY_LOOP',
            timestampMs: Date.now(),
            soundId: loopSoundId as SoundId,
            regionName: loopRegion as RegionId
        });
    };

    const handleStopLoop = () => {
        if (!loopSoundId) return;
        // oxlint-disable-next-line typescript/no-explicit-any
        sendCommand({
            type: 'STOP_LOOP',
            timestampMs: Date.now(),
            soundId: loopSoundId as SoundId
        });
    };

    const handleExecuteTransition = () => {
        if (!loopSoundId || !targetRegion) return;
        // oxlint-disable-next-line typescript/no-explicit-any
        sendCommand({
            type: 'TRANSITION_MUSIC',
            timestampMs: Date.now(),
            soundId: loopSoundId as SoundId,
            targetRegion: targetRegion as RegionId,
            transitionRegionName: transitionRegion as RegionId,
            options: {
                quantize,
                quantizeInterval,
                blendMode,
                crossfadeDuration: crossfadeSec * 1000,
                interruptable
            }
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

                {/* ADVANCED SEQUENCER CONTROL */}
                {musicConfigs.length > 0 && (
                    <section className="border-t border-border/50 pt-4 space-y-4">
                        <div className="text-[10px] uppercase text-foreground-muted font-bold tracking-wider">
                            Interactive Music Sequencer
                        </div>

                        <div className="p-3 bg-surface-active/40 border border-border/60 rounded space-y-4 font-mono text-xs">
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center">
                                    <label className="text-[9px] uppercase font-bold text-foreground-muted">
                                        Sound / Music Container
                                    </label>
                                    <span
                                        className={clsx(
                                            'px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase',
                                            liveTrackState?.state === 'LOOPING' && 'bg-success/20 text-success',
                                            liveTrackState?.state === 'TRANSITIONING' &&
                                                'bg-warning/20 text-warning animate-pulse',
                                            !liveTrackState && 'bg-background text-foreground-muted'
                                        )}
                                    >
                                        {liveTrackState ? liveTrackState.state : 'IDLE'}
                                    </span>
                                </div>
                                <select
                                    value={loopSoundId}
                                    onChange={e => {
                                        setLoopSoundId(e.target.value);
                                    }}
                                    className="w-full px-2 py-1 bg-background border border-border rounded text-[11px] outline-none text-primary font-bold"
                                >
                                    {musicConfigs.map(m => (
                                        <option key={m.id} value={m.id}>
                                            🎵 {m.id} ({m.bpm} BPM)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {liveTrackState && (
                                <div className="bg-background/80 p-2 rounded border border-border/40 text-[11px] space-y-1">
                                    <div className="flex justify-between">
                                        <span className="text-foreground-muted">Current Region:</span>
                                        <span className="text-info font-bold">{liveTrackState.currentRegion}</span>
                                    </div>
                                    {liveTrackState.targetRegion && (
                                        <div className="flex justify-between items-center text-warning font-semibold">
                                            <span>Pending Cut (Queue: {liveTrackState.queueLength}):</span>
                                            <span className="animate-pulse">➔ {liveTrackState.targetRegion}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-1.5 border-t border-border/30 pt-3">
                                <div className="grid grid-cols-2 gap-2 items-end">
                                    <div className="space-y-1">
                                        <label className="text-[9px] uppercase font-bold text-foreground-muted">
                                            Start Region
                                        </label>
                                        <select
                                            value={loopRegion}
                                            onChange={e => {
                                                setLoopRegion(e.target.value);
                                            }}
                                            className="w-full px-1.5 py-1 bg-background border border-border rounded text-[11px] outline-none"
                                        >
                                            {regions.map(r => (
                                                <option key={r} value={r}>
                                                    {r}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={handlePlayLoop}
                                            disabled={!loopRegion}
                                            className="flex-1 py-1 bg-success/20 hover:bg-success/30 text-success border border-success/40 font-bold rounded text-[10px] uppercase transition-colors"
                                        >
                                            Play Loop
                                        </button>
                                        <button
                                            onClick={handleStopLoop}
                                            disabled={!liveTrackState}
                                            className="flex-1 py-1 bg-background hover:bg-surface-active text-foreground-muted border border-border font-bold rounded text-[10px] uppercase transition-colors"
                                        >
                                            Stop
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 border-t border-border/30 pt-3">
                                <div className="text-[9px] uppercase font-bold text-foreground-muted tracking-wider">
                                    Transition Options
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[9px] uppercase font-bold text-foreground-muted">
                                            Target
                                        </label>
                                        <select
                                            value={targetRegion}
                                            onChange={e => {
                                                setTargetRegion(e.target.value);
                                            }}
                                            className="w-full px-1.5 py-1 bg-background border border-border rounded text-[11px] outline-none"
                                        >
                                            {regions.map(r => (
                                                <option key={r} value={r}>
                                                    {r}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] uppercase font-bold text-foreground-muted">
                                            Transition Region
                                        </label>
                                        <select
                                            value={transitionRegion}
                                            onChange={e => {
                                                setTransitionRegion(e.target.value);
                                            }}
                                            className="w-full px-1.5 py-1 bg-background border border-border rounded text-[11px] outline-none"
                                        >
                                            <option value="">— None —</option>
                                            {regions.map(r => (
                                                <option key={r} value={r}>
                                                    {r}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[9px] uppercase font-bold text-foreground-muted">
                                            Quantize Mode
                                        </label>
                                        <select
                                            value={quantize}
                                            onChange={e => {
                                                setQuantize(e.target.value as any);
                                            }}
                                            className="w-full px-1.5 py-1 bg-background border border-border rounded text-[11px] outline-none"
                                        >
                                            <option value="Immediate">Immediate</option>
                                            <option value="NextBeat">Next Beat</option>
                                            <option value="NextBar">Next Bar</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9px] uppercase font-bold text-foreground-muted">
                                            Interval ({quantizeInterval})
                                        </label>
                                        <div className="grid grid-cols-4 gap-1">
                                            {[1, 2, 3, 4, 5, 6, 7, 8].map(v => (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    onClick={() => {
                                                        setQuantizeInterval(v);
                                                    }}
                                                    disabled={quantize === 'Immediate'}
                                                    className={clsx(
                                                        'py-0.5 text-[10px] font-bold border rounded transition-colors',
                                                        quantizeInterval === v
                                                            ? 'bg-primary text-background border-primary'
                                                            : 'bg-background border-border hover:bg-surface-active disabled:opacity-20'
                                                    )}
                                                >
                                                    {v}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 items-center">
                                    <div className="space-y-1">
                                        <label className="text-[9px] uppercase font-bold text-foreground-muted">
                                            Blend Mode
                                        </label>
                                        <select
                                            value={blendMode}
                                            onChange={e => {
                                                setBlendMode(e.target.value as any);
                                            }}
                                            className="w-full px-1.5 py-1 bg-background border border-border rounded text-[11px] outline-none"
                                        >
                                            <option value="overlap">Overlap</option>
                                            <option value="crossfade">Crossfade</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] uppercase font-bold text-foreground-muted">
                                            Fade (s)
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={10}
                                            step={0.001}
                                            value={crossfadeSec}
                                            onChange={e => {
                                                setCrossfadeSec(parseFloat(e.target.value) || 0);
                                            }}
                                            className="w-full px-1.5 py-1 bg-background border border-border rounded text-[11px] text-right"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 justify-end h-full pt-4">
                                        <input
                                            type="checkbox"
                                            id="interruptable_chk"
                                            checked={interruptable}
                                            onChange={e => {
                                                setInterruptable(e.target.checked);
                                            }}
                                            className="w-4 h-4 cursor-pointer"
                                        />
                                        <label
                                            htmlFor="interruptable_chk"
                                            className="text-[10px] font-bold uppercase cursor-pointer text-foreground-muted"
                                        >
                                            Int.
                                        </label>
                                    </div>
                                </div>

                                <button
                                    onClick={handleExecuteTransition}
                                    disabled={!liveTrackState}
                                    className="w-full py-2 bg-primary/20 hover:bg-primary/30 disabled:opacity-30 disabled:hover:bg-primary/20 border border-primary/40 font-bold rounded text-[11px] tracking-wider uppercase transition-colors"
                                >
                                    ➔ Execute Transition
                                </button>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};
