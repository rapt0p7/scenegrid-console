// oxlint-disable max-lines-per-function
// noinspection D

import React, { useRef, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import type { ITelemetryCauseChain, ITelemetryLifecycleEvent } from '@scene-grid/shared';

interface RawLoggerProps {
    logs: Array<ITelemetryLifecycleEvent | ITelemetryCauseChain>;
    onLogClick?: (targetTime: number) => void;
    isLive?: boolean;
    inspectedTime?: number | null;
}

export const RawLogger: React.FC<RawLoggerProps> = ({ logs, onLogClick, isLive = true, inspectedTime }) => {
    const activeLogRef = useRef<HTMLDivElement>(null);

    const closestTime = useMemo(() => {
        if (inspectedTime == null || logs.length === 0) return null;

        const closest = logs.reduce((prev, curr) => {
            const prevDiff = Math.abs(prev.timestampMs - inspectedTime);
            const currDiff = Math.abs(curr.timestampMs - inspectedTime);
            return currDiff < prevDiff ? curr : prev;
        });

        if (Math.abs(closest.timestampMs - inspectedTime) > 500) {
            return null;
        }

        return closest.timestampMs;
    }, [inspectedTime, logs]);

    useEffect(() => {
        if (!isLive && activeLogRef.current) {
            activeLogRef.current.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
    }, [closestTime, isLive]);

    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const renderInitiator = (initiator: ITelemetryCauseChain['initiator']) => {
        switch (initiator.type) {
            case 'API':
                return `API::${initiator.method}`;
            case 'EVENT':
                return `EVENT::${initiator.eventId}`;
            case 'MAGNET':
                return `MAGNET::${initiator.sourceRegion}->${initiator.targetRegion}`;
            case 'CONTAINER_POLICY':
                return `CONTAINER::${initiator.containerId}`;
            case 'CULLING_ARBITER':
                return `CULLING::${initiator.reason}`;
            case 'RAM_QUOTA_MANAGER':
                return `RAM_QUOTA`;
            default:
                return 'UNKNOWN';
        }
    };

    if (logs.length === 0) {
        return (
            <div className="flex-1 p-4 text-foreground-muted italic flex items-center justify-center">
                Waiting for engine telemetry...
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {logs.map((log, i) => {
                const isCause = log.type === 'CAUSE_CHAIN';
                const isBlocked = isCause && log.result.type === 'BLOCKED';
                const isSnapshotChange = isCause && log.result.type === 'SET_MIX_SNAPSHOT';
                const isOomEviction = isCause && log.result.type === 'OOM_CRITICAL_EVICTION';
                const isActive = !isLive && closestTime === log.timestampMs;

                return (
                    <div
                        key={i}
                        ref={isActive ? activeLogRef : undefined}
                        onClick={() => onLogClick?.(log.timestampMs)}
                        className={clsx(
                            'p-2 rounded-sm border-l-4 transition-all cursor-pointer',
                            isActive
                                ? 'bg-surface-active ring-1 ring-primary shadow-md'
                                : isBlocked || isOomEviction
                                  ? 'bg-danger/20'
                                  : isSnapshotChange
                                    ? 'bg-info/10'
                                    : 'bg-surface hover:bg-surface-hover',
                            isBlocked || isOomEviction
                                ? 'border-danger'
                                : isSnapshotChange
                                  ? 'border-info'
                                  : isCause
                                    ? 'border-primary'
                                    : 'border-success'
                        )}
                    >
                        <div className="text-[10px] text-foreground-muted mb-1">{log.timestampMs.toFixed(2)}ms</div>

                        {log.type === 'LIFECYCLE' && (
                            <div className="leading-tight">
                                <strong className="text-success">[LIFECYCLE]</strong>
                                <span className="text-warning ml-1">{log.action}</span>
                                <span className="text-foreground-muted ml-2">
                                    V:{log.playbackId} | S:<b className="text-foreground">{log.soundId}</b>
                                </span>
                                {log.reason && <span className="text-warning ml-1">({log.reason})</span>}
                            </div>
                        )}

                        {log.type === 'CAUSE_CHAIN' && log.result.type === 'SET_MIX_SNAPSHOT' && (
                            <div className="leading-tight flex items-center gap-2 py-1">
                                <strong className="text-info tracking-wider">MIX SNAPSHOT APPLIED</strong>
                                <span className="text-foreground font-bold bg-background px-1.5 rounded text-[10px]">
                                    {log.result.snapshotId}
                                </span>
                                {log.result.fadeTime > 0 && (
                                    <span className="text-foreground-muted text-[10px]">
                                        ({log.result.fadeTime}ms fade)
                                    </span>
                                )}
                            </div>
                        )}

                        {log.type === 'CAUSE_CHAIN' && log.result.type === 'OOM_CRITICAL_EVICTION' && (
                            <div className="leading-tight">
                                <strong className="text-danger tracking-wider">
                                    [{renderInitiator(log.initiator)}] OOM CRITICAL EVICTION
                                </strong>
                                <div className="mt-1 text-foreground-muted text-[10px] break-all">
                                    Asset dropped: <span className="text-danger font-mono">{log.result.targetUrl}</span>
                                </div>
                            </div>
                        )}

                        {log.type === 'CAUSE_CHAIN' &&
                            log.result.type !== 'SET_MIX_SNAPSHOT' &&
                            log.result.type !== 'OOM_CRITICAL_EVICTION' && (
                                <div className="leading-tight">
                                    <strong className={clsx(isBlocked ? 'text-danger' : 'text-primary')}>
                                        [{renderInitiator(log.initiator)}]
                                    </strong>
                                    <span className="mx-2 text-foreground-muted">-&gt;</span>
                                    <span className={clsx(isBlocked ? 'text-danger font-bold' : 'text-info')}>
                                        {log.result.type}{' '}
                                        {log.result.type === 'PLAY' || log.result.type === 'STOP'
                                            ? log.result.target
                                            : ''}
                                    </span>

                                    {log.conditionTrace && (
                                        <div className="mt-1 pl-2 ml-1 border-l-2 border-border text-foreground-muted text-[10px]">
                                            Cond: {log.conditionTrace.param} {log.conditionTrace.operator}{' '}
                                            {log.conditionTrace.threshold}
                                            <span className="mx-1">|</span>
                                            Act: {log.conditionTrace.actualValue}
                                            <span
                                                className={clsx(
                                                    'ml-2 font-bold',
                                                    log.conditionTrace.passed ? 'text-success' : 'text-danger'
                                                )}
                                            >
                                                [{log.conditionTrace.passed ? 'PASS' : 'FAIL'}]
                                            </span>
                                        </div>
                                    )}

                                    {log.result.type === 'BLOCKED' && (
                                        <div className="mt-1 text-danger text-[10px]">Reason: {log.result.reason}</div>
                                    )}
                                </div>
                            )}
                    </div>
                );
            })}
        </div>
    );
};
