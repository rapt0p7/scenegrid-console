// noinspection D

import AudioGrid from '@domain/Orchestration/AudioGrid.js';
import { IPlaybackInfo, LoopState } from '@domain/Orchestration/Ports/ISequencer.js';

import type { ITransitionToParameters, ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IEngineTicker } from '@domain/Shared/Ports/IEngineTicker.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { PlaybackId, RegionId, SoundId, TickerTaskId, DeepReadonly, QuantizeType } from '@scene-grid/shared';
import { isDefined, isAbsent } from '@scene-grid/shared';
import SmartLoopTransitionPolicy from '@domain/Orchestration/SmartLoopTransitionPolicy.js';
import { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';

interface ActiveRegion {
    playbackId: PlaybackId;
    scheduledStartTime: number;
    unsubscribe: () => void;
}

interface QueuedRegion {
    name: RegionId;
    fadeInDurationMs: number;
    startOffsetSec?: number;
}

interface TrackContext {
    soundId: SoundId;
    state: LoopState;
    playId: number;
    nextScheduleTime: number;
    activeRegions: Set<ActiveRegion>;
    gridStartTime: number | null;
    regionQueue: QueuedRegion[];
    loopRegion: RegionId | null;
    currentRegion: RegionId | null;
    magnetStates: boolean[];
}

export default class Sequencer implements ISequencer {
    private tracks: Map<SoundId, TrackContext> = new Map();
    private readonly scheduleIntervalMs = 25;
    private readonly lookaheadWindowSec = 0.1;

    constructor(
        private readonly controller: ISoundController,
        private readonly router: IAudioRouter,
        private readonly ticker: IEngineTicker,
        private readonly transitionPolicy: SmartLoopTransitionPolicy,
        private readonly telemetry?: ITelemetryDispatcher
    ) {
        this.startScheduler();
    }

    playLoop(soundId: SoundId, regionName: RegionId): void {
        this.stopLoop(soundId);
        const track = this.getTrackContext(soundId);
        track.playId++;
        track.state = LoopState.LOOPING;
        track.nextScheduleTime = 0;
        track.gridStartTime = null;
        track.regionQueue = [];
        track.loopRegion = regionName;
        track.currentRegion = regionName;

        this.tick();
    }

    stopLoop(soundId: SoundId): void {
        const track = this.tracks.get(soundId);
        if (isAbsent(track) || track.state === LoopState.IDLE) return;

        track.playId++;
        track.state = LoopState.IDLE;
        track.nextScheduleTime = 0;
        track.gridStartTime = null;
        track.regionQueue = [];
        track.loopRegion = null;

        for (const active of track.activeRegions) {
            try {
                active.unsubscribe();
            } catch {}
            try {
                this.controller.cancelScheduled(active.playbackId);
            } catch {}
        }
        track.activeRegions.clear();
    }

    public destroy(): void {
        this.ticker.remove('sequencer');
    }

    // oxlint-disable-next-line max-lines-per-function
    public transitionTo({
        soundId,
        targetRegion,
        transitionRegionName,
        options = { interruptable: true, quantize: 'Immediate' }
    }: DeepReadonly<ITransitionToParameters>): void {
        const track = this.getTrackContext(soundId);
        if (track.state === LoopState.IDLE) return;
        if (track.state === LoopState.TRANSITIONING && !options.interruptable) return;

        const config = this.router.getSoundConfig(soundId);
        if (isAbsent(config) || !('smartLoop' in config)) return;

        track.playId++;
        track.state = LoopState.TRANSITIONING;

        const now = this.controller.getCurrentTime();
        let targetTime = now;

        if (isDefined(options.quantize) && options.quantize !== 'Immediate') {
            const interval = options.quantizeInterval ?? 1;
            let currentAnchorTime = track.gridStartTime ?? 0;

            for (const active of track.activeRegions) {
                if (active.scheduledStartTime <= now) {
                    currentAnchorTime = active.scheduledStartTime;
                }
            }

            if (isDefined(options.grid)) {
                targetTime =
                    options.quantize === 'NextBeat'
                        ? options.grid.getNextBeatTime(now, interval)
                        : options.grid.getNextBarTime(now, interval);
            } else if (isDefined(track.gridStartTime)) {
                const grid = new AudioGrid(
                    config.smartLoop.bpm ?? 60,
                    config.smartLoop.beatsPerBar ?? 4,
                    currentAnchorTime
                );
                targetTime =
                    options.quantize === 'NextBeat'
                        ? grid.getNextBeatTime(now, interval)
                        : grid.getNextBarTime(now, interval);
            }
        }

        const crossfadeMs =
            options.quantize === 'Immediate'
                ? (options.crossfadeDuration ?? 0)
                : (options.crossfadeDuration ?? config.smartLoop.crossfade ?? 0);

        const crossfadeSec = crossfadeMs / 1000;
        const isMusicalOverlap = isDefined(options.tailDurationMs);
        const overrideTailSec = (options.tailDurationMs ?? 0) / 1000;

        for (const active of track.activeRegions) {
            try {
                active.unsubscribe();
            } catch {}

            if (active.scheduledStartTime >= targetTime) {
                try {
                    this.controller.cancelScheduled(active.playbackId);
                } catch {}
                continue;
            }

            if (isMusicalOverlap) {
                if (overrideTailSec > 0) {
                    this.controller.stopById(active.playbackId, targetTime + overrideTailSec);
                } else {
                    this.controller.stopById(active.playbackId, targetTime);
                }
            } else if (crossfadeMs > 0) {
                const delayMsToFade = Math.max(0, (targetTime - now) * 1000);
                this.controller.fadeVolume(active.playbackId, 0, crossfadeMs, 'equal-power', delayMsToFade);
                this.controller.stopById(active.playbackId, targetTime + crossfadeSec);
            } else {
                this.controller.stopById(active.playbackId, targetTime);
            }
        }

        track.activeRegions.clear();
        track.regionQueue = [];
        track.nextScheduleTime = targetTime;

        let targetStartOffsetSec = 0;
        if (options.offsetMode && options.offsetMode !== 'None' && track.currentRegion) {
            const sourceRegion = config.smartLoop.regions[track.currentRegion];
            const targetRegionData = config.smartLoop.regions[targetRegion];

            if (sourceRegion && targetRegionData) {
                const sr = this.controller.getSampleRate();
                const sourceLenSec = (sourceRegion[1] - sourceRegion[0]) / sr;
                const targetLenSec = (targetRegionData[1] - targetRegionData[0]) / sr;

                if (sourceLenSec > 0) {
                    const elapsedAtTarget = Math.max(0, targetTime - (track.gridStartTime ?? now));
                    let phase = (elapsedAtTarget % sourceLenSec) / sourceLenSec;

                    if (options.offsetMode === 'Inverted') {
                        phase = 1.0 - phase;
                    }
                    targetStartOffsetSec = phase * targetLenSec;
                }
            }
        }

        if (isDefined(transitionRegionName) && transitionRegionName !== '') {
            track.regionQueue.push(
                { name: transitionRegionName, fadeInDurationMs: crossfadeMs },
                { name: targetRegion, fadeInDurationMs: 0, startOffsetSec: targetStartOffsetSec }
            );
        } else {
            track.regionQueue.push({
                name: targetRegion,
                fadeInDurationMs: crossfadeMs,
                startOffsetSec: targetStartOffsetSec
            });
        }

        track.loopRegion = targetRegion;
        track.currentRegion = targetRegion;
        track.state = LoopState.LOOPING;

        this.tick();
    }

    public playStinger(stingerId: SoundId, quantize: QuantizeType = 'NextBeat', referenceTrackId?: SoundId): void {
        const now = this.controller.getCurrentTime();

        if (quantize === 'Immediate') {
            this.router.play(stingerId, { delayMs: 0 });
            return;
        }

        const refTrackId = isDefined(referenceTrackId)
            ? referenceTrackId
            : Array.from(this.tracks.values()).find(t => t.state === LoopState.LOOPING)?.soundId;

        const playbackInfo = isDefined(refTrackId) ? this.getPlaybackInfo(refTrackId) : undefined;

        if (isAbsent(playbackInfo)) {
            this.router.play(stingerId, { delayMs: 0 });
            return;
        }

        const { grid } = playbackInfo;
        const targetTime = quantize === 'NextBar' ? grid.getNextBarTime(now) : grid.getNextBeatTime(now);
        const delaySec = Math.max(0, targetTime - now);

        this.router.play(stingerId, { delayMs: delaySec * 1000 });
    }

    public getPlaybackInfo(soundId: SoundId): IPlaybackInfo | null {
        const track = this.tracks.get(soundId);

        if (isAbsent(track) || track.state !== LoopState.LOOPING || isAbsent(track.gridStartTime)) {
            return null;
        }

        const config = this.router.getSoundConfig(soundId);
        if (isAbsent(config) || !('smartLoop' in config)) {
            return null;
        }

        const bpm = config.smartLoop.bpm ?? 120;
        const beatsPerBar = config.smartLoop.beatsPerBar ?? 4;

        return {
            grid: new AudioGrid(bpm, beatsPerBar, track.gridStartTime)
        };
    }

    // oxlint-disable-next-line max-lines-per-function
    public tick(): void {
        for (const [soundId, track] of this.tracks.entries()) {
            if (track.state !== LoopState.LOOPING) continue;

            if (isDefined(track.currentRegion)) {
                const config = this.router.getSoundConfig(soundId);
                if (isDefined(config) && 'smartLoop' in config) {
                    const decision = this.transitionPolicy.evaluate(config, track.currentRegion, track.magnetStates);

                    if (decision) {
                        this.telemetry?.dispatch({
                            type: 'CAUSE_CHAIN',
                            timestampMs: this.controller.getCurrentTime() * 1000,
                            initiator: {
                                type: 'MAGNET',
                                sourceRegion: track.currentRegion,
                                targetRegion: decision.targetRegion
                            },
                            result: { type: 'TRANSITION', target: track.soundId, toRegion: decision.targetRegion },
                            conditionTrace: decision.trace
                        });
                        this.transitionTo({
                            soundId,
                            targetRegion: decision.targetRegion,
                            transitionRegionName: decision.transitionRegionName,
                            options: decision.options
                        });
                        continue;
                    }
                }
            }

            const now = this.controller.getCurrentTime();
            const scheduleHorizon = now + this.lookaheadWindowSec;

            while (track.nextScheduleTime < scheduleHorizon) {
                let nextRegionName: RegionId | null = null;
                let fadeInMs = 0;
                let startOffsetSec = 0;

                if (track.regionQueue.length > 0) {
                    const queued = track.regionQueue.shift()!;
                    nextRegionName = queued.name;
                    fadeInMs = queued.fadeInDurationMs;
                    startOffsetSec = queued.startOffsetSec ?? 0;
                } else if (isDefined(track.loopRegion)) {
                    nextRegionName = track.loopRegion;
                }

                if (isAbsent(nextRegionName)) break;

                const regionStartTime = track.nextScheduleTime;
                const playbackId = this.scheduleRegion({
                    soundId,
                    regionName: nextRegionName,
                    targetTime: regionStartTime,
                    track,
                    startOffsetSec
                });

                if (isDefined(playbackId)) {
                    if (fadeInMs > 0) {
                        const delayMsToFade = Math.max(0, (regionStartTime - now) * 1000);
                        this.controller.setVolume(playbackId, 0);
                        this.controller.fadeVolume(playbackId, 1, fadeInMs, 'equal-power', delayMsToFade);
                    } else {
                        this.controller.setVolume(playbackId, 1);
                    }
                }

                if (track.nextScheduleTime <= regionStartTime) break;
            }
        }
    }

    private getTrackContext(soundId: SoundId): TrackContext {
        if (!this.tracks.has(soundId)) {
            this.tracks.set(soundId, {
                soundId,
                state: LoopState.IDLE,
                playId: 0,
                nextScheduleTime: 0,
                activeRegions: new Set(),
                gridStartTime: null,
                regionQueue: [],
                loopRegion: null,
                currentRegion: null,
                magnetStates: []
            });
        }
        return this.tracks.get(soundId)!;
    }

    // oxlint-disable-next-line typescript/prefer-readonly-parameter-types, max-lines-per-function
    private scheduleRegion({
        soundId,
        regionName,
        targetTime,
        track,
        startOffsetSec = 0
    }: {
        soundId: SoundId;
        regionName: RegionId;
        targetTime: number;
        track: TrackContext;
        startOffsetSec?: number;
    }): PlaybackId | null {
        const config = this.router.getSoundConfig(soundId);
        if (isAbsent(config) || !('smartLoop' in config)) return null;

        const region = config.smartLoop.regions[regionName];
        if (isAbsent(region)) return null;

        const [startSample, endSample, preEntryMs = 0, tailMs = 0] = region;
        const sampleRate = this.controller.getSampleRate();

        const fullLogicalDurationSec = (endSample - startSample) / sampleRate;
        const safeStartOffsetSec = Math.min(startOffsetSec, fullLogicalDurationSec);

        const preEntrySec = safeStartOffsetSec > 0 ? 0 : preEntryMs / 1000;
        const tailSec = tailMs / 1000;

        const logicalDurationSec = fullLogicalDurationSec - safeStartOffsetSec;
        const logicalOffsetSec = startSample / sampleRate + safeStartOffsetSec;

        let actualOffsetSec = Math.max(0, logicalOffsetSec - preEntrySec);

        let actualDurationSec = logicalDurationSec + (logicalOffsetSec - actualOffsetSec) + tailSec;

        let actualTargetTime = targetTime - preEntrySec;
        let logicalScheduledTime = targetTime;

        const now = this.controller.getCurrentTime();

        if (actualTargetTime < now) {
            if (isAbsent(track.gridStartTime) && targetTime === 0) {
                actualTargetTime = now;
                logicalScheduledTime = now + preEntrySec;
            } else {
                const missedSec = now - actualTargetTime;
                if (now >= targetTime) {
                    actualOffsetSec = logicalOffsetSec + (now - targetTime);
                    actualDurationSec = Math.max(0, logicalDurationSec - (now - targetTime) + tailSec);
                    actualTargetTime = now;
                } else {
                    actualOffsetSec += missedSec;
                    actualDurationSec -= missedSec;
                    actualTargetTime = now;
                }
            }
        }

        const delaySec = Math.max(0, actualTargetTime - now);

        const playbackId = this.controller.play(soundId, {
            when: delaySec,
            offset: actualOffsetSec,
            duration: actualDurationSec
        });

        if (isAbsent(playbackId)) {
            console.warn(`[Sequencer] Failed to schedule region ${regionName} for ${soundId} (voice dropped).`);
            track.nextScheduleTime = logicalScheduledTime + logicalDurationSec;
            return null;
        }

        this.router.applyConfigToPlayback(playbackId, config);

        track.gridStartTime ??= logicalScheduledTime;
        track.nextScheduleTime = logicalScheduledTime + logicalDurationSec;

        const activeRegion: ActiveRegion = {
            playbackId,
            scheduledStartTime: logicalScheduledTime,
            unsubscribe: () => {}
        };

        activeRegion.unsubscribe = this.controller.onVoiceEnded(playbackId, () => {
            track.activeRegions.delete(activeRegion);
            try {
                activeRegion.unsubscribe();
            } catch {}
        });

        track.activeRegions.add(activeRegion);
        return playbackId;
    }

    private startScheduler(): void {
        this.ticker.add('sequencer' as TickerTaskId, this.scheduleIntervalMs, this);
    }
}
