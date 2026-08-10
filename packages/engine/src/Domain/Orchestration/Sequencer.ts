// oxlint-disable max-depth
// noinspection D

import type { ITransitionToParameters, ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IEngineTicker } from '@domain/Shared/Ports/IEngineTicker.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';

import AudioGrid from '@domain/Orchestration/AudioGrid.js';
import { type IPlaybackInfo, LoopState } from '@domain/Orchestration/Ports/ISequencer.js';
import SmartLoopTransitionPolicy from '@domain/Orchestration/SmartLoopTransitionPolicy.js';
import {
    PlaybackId,
    RegionId,
    SoundId,
    TickerTaskId,
    DeepReadonly,
    QuantizeType,
    IMusicTrackSnapshot,
    Milliseconds,
    Seconds,
    TimeMath,
    Samples,
    Pulses,
    BPM,
    Beats
} from '@scene-grid/shared';
import { isDefined, isAbsent } from '@scene-grid/shared';

interface ActiveRegion {
    playbackId: PlaybackId;
    scheduledStartTime: Seconds;
    unsubscribe: () => void;
}

interface QueuedRegion {
    name: RegionId;
    fadeInDuration: Milliseconds;
    startOffset?: Seconds;
}

interface TrackContext {
    soundId: SoundId;
    state: LoopState;
    playId: number;
    nextScheduleTime: Seconds;
    activeRegions: Set<ActiveRegion>;
    gridStartTime: Seconds | null;
    regionQueue: QueuedRegion[];
    loopRegion: RegionId | null;
    currentRegion: RegionId | null;
    magnetStates: boolean[];
}

type MutableMusicSnapshot = {
    -readonly [K in keyof IMusicTrackSnapshot]: IMusicTrackSnapshot[K];
};

export default class Sequencer implements ISequencer {
    private static readonly TICK_DIVIDER: number = 2;
    private tracks: Map<SoundId, TrackContext> = new Map();
    private readonly snapshotPool: MutableMusicSnapshot[] = [];
    private readonly activeSnapshots: IMusicTrackSnapshot[] = [];
    private readonly lookaheadWindowSec = 0.1 as Seconds;

    constructor(
        private readonly controller: ISoundController,
        private readonly router: IAudioRouter,
        private readonly ticker: IEngineTicker,
        private readonly transitionPolicy: SmartLoopTransitionPolicy,
        private readonly ppqn: Pulses = 960 as Pulses,
        private readonly telemetry?: ITelemetryDispatcher
    ) {
        this.startScheduler();
    }

    playLoop(soundId: SoundId, regionName: RegionId): void {
        this.stopLoop(soundId);
        const track = this.getTrackContext(soundId);
        track.playId++;
        track.state = LoopState.LOOPING;
        track.nextScheduleTime = 0 as Seconds;
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
        track.nextScheduleTime = 0 as Seconds;
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
            const interval = options.quantizeInterval ?? (1 as Beats);
            let currentAnchorTime = track.gridStartTime ?? (0 as Seconds);

            for (const active of track.activeRegions) {
                if (active.scheduledStartTime <= now) {
                    currentAnchorTime = active.scheduledStartTime;
                }
            }

            const grid =
                options.grid ??
                new AudioGrid(
                    config.smartLoop.bpm ?? (60 as BPM),
                    config.smartLoop.beatsPerBar ?? (4 as Beats),
                    TimeMath.castToContextTime(currentAnchorTime),
                    this.ppqn ?? (960 as Pulses)
                );

            if (typeof options.quantize === 'string') {
                targetTime =
                    options.quantize === 'NextBeat'
                        ? grid.getNextBeatTime(now, interval)
                        : grid.getNextBarTime(now, interval);
            } else if (options.quantize.type === 'ExactPulse') {
                const currentPulse = grid.getPulseAtTime(now);
                const targetPulse = (currentPulse + options.quantize.pulseOffset) as Pulses;
                targetTime = grid.getTimeAtPulse(targetPulse);
            } else if (options.quantize.type === 'NextGridDivision') {
                targetTime = grid.getNextDivisionTime(now, options.quantize.division);
            }
        }

        const crossfade =
            options.quantize === 'Immediate'
                ? (options.crossfadeDuration ?? (0 as Milliseconds))
                : (options.crossfadeDuration ?? config.smartLoop.crossfade ?? (0 as Milliseconds));

        const crossfadeSec = TimeMath.msToSeconds(crossfade);
        const isMusicalOverlap = isDefined(options.tailDuration);
        const overrideTailSec = TimeMath.msToSeconds(options.tailDuration ?? (0 as Milliseconds));

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
                    this.controller.stopById(active.playbackId, TimeMath.addTime(targetTime, overrideTailSec));
                } else {
                    this.controller.stopById(active.playbackId, targetTime);
                }
            } else if (crossfade > 0) {
                const delayMsToFade = TimeMath.secondsToMilliseconds(TimeMath.timeUntil(now, targetTime));
                this.controller.fadeVolume(active.playbackId, 0, crossfade, 'equal-power', delayMsToFade);
                this.controller.stopById(active.playbackId, TimeMath.addTime(targetTime, crossfadeSec));
            } else {
                this.controller.stopById(active.playbackId, targetTime);
            }
        }

        track.activeRegions.clear();
        track.regionQueue = [];
        track.nextScheduleTime = TimeMath.castToSeconds(targetTime);

        let targetStartOffsetSec = 0 as Seconds;
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
                    targetStartOffsetSec = (phase * targetLenSec) as Seconds;
                }
            }
        }

        if (isDefined(transitionRegionName) && transitionRegionName !== '') {
            track.regionQueue.push(
                { name: transitionRegionName, fadeInDuration: crossfade },
                { name: targetRegion, fadeInDuration: 0 as Milliseconds, startOffset: targetStartOffsetSec }
            );
        } else {
            track.regionQueue.push({
                name: targetRegion,
                fadeInDuration: crossfade,
                startOffset: targetStartOffsetSec
            });
        }

        track.loopRegion = targetRegion;
        track.currentRegion = targetRegion;

        this.tick();
    }

    public playStinger(stingerId: SoundId, quantize: QuantizeType = 'NextBeat', referenceTrackId?: SoundId): void {
        const now = this.controller.getCurrentTime();

        if (quantize === 'Immediate') {
            this.router.play(stingerId, { delay: 0 as Milliseconds });
            return;
        }

        const refTrackId = isDefined(referenceTrackId)
            ? referenceTrackId
            : Array.from(this.tracks.values()).find(t => t.state === LoopState.LOOPING)?.soundId;

        const playbackInfo = isDefined(refTrackId) ? this.getPlaybackInfo(refTrackId) : undefined;

        if (isAbsent(playbackInfo)) {
            this.router.play(stingerId, { delay: 0 as Milliseconds });
            return;
        }

        const { grid } = playbackInfo;
        let targetTime = now;

        if (typeof quantize === 'string') {
            targetTime = quantize === 'NextBar' ? grid.getNextBarTime(now) : grid.getNextBeatTime(now);
        } else if (quantize.type === 'ExactPulse') {
            const currentPulse = grid.getPulseAtTime(now);
            targetTime = grid.getTimeAtPulse((currentPulse + quantize.pulseOffset) as Pulses);
        } else if (quantize.type === 'NextGridDivision') {
            targetTime = grid.getNextDivisionTime(now, quantize.division);
        }

        this.router.play(stingerId, { when: targetTime });
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

        const bpm = config.smartLoop.bpm ?? (120 as BPM);
        const beatsPerBar = config.smartLoop.beatsPerBar ?? (4 as Beats);

        return {
            grid: new AudioGrid(bpm, beatsPerBar, TimeMath.castToContextTime(track.gridStartTime), this.ppqn),
            soundId: track.soundId,
            state: track.state
        };
    }

    public getMusicSnapshot(): readonly IMusicTrackSnapshot[] {
        let count = 0;

        this.tracks.forEach((track, soundId) => {
            if (track.state === LoopState.IDLE) return;
            if (count >= this.snapshotPool.length) {
                this.snapshotPool.push({
                    soundId: '' as SoundId,
                    state: 'IDLE',
                    currentRegion: null,
                    targetRegion: null,
                    queueLength: 0
                });
            }

            const snap = this.snapshotPool[count];
            snap.soundId = soundId;
            snap.state = track.state;
            snap.currentRegion = track.currentRegion;
            snap.targetRegion = track.regionQueue.length > 0 ? track.regionQueue[0].name : null;
            snap.queueLength = track.regionQueue.length;

            this.activeSnapshots[count] = snap;
            count++;
        });

        this.activeSnapshots.length = count;

        return this.activeSnapshots;
    }

    // oxlint-disable-next-line max-lines-per-function
    public tick(): void {
        for (const [soundId, track] of this.tracks.entries()) {
            if (track.state === LoopState.IDLE) continue;

            if (track.state === LoopState.LOOPING && isDefined(track.currentRegion)) {
                const config = this.router.getSoundConfig(soundId);
                if (isDefined(config) && 'smartLoop' in config) {
                    const decision = this.transitionPolicy.evaluate(config, track.currentRegion, track.magnetStates);

                    if (decision) {
                        this.telemetry?.dispatch({
                            type: 'CAUSE_CHAIN',
                            timestampMs: TimeMath.secondsToMilliseconds(
                                TimeMath.castToSeconds(this.controller.getCurrentTime())
                            ),
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
                let fadeInMs = 0 as Milliseconds;
                let startOffsetSec = 0 as Seconds;

                if (track.regionQueue.length > 0) {
                    const queued = track.regionQueue.shift()!;
                    nextRegionName = queued.name;
                    fadeInMs = queued.fadeInDuration;
                    startOffsetSec = queued.startOffset ?? (0 as Seconds);
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
                    if (track.state === LoopState.TRANSITIONING) {
                        const otherActiveRegions = [...track.activeRegions].filter(r => r.playbackId !== playbackId);

                        if (otherActiveRegions.length > 0) {
                            for (const active of otherActiveRegions) {
                                this.router.performCrossfade(active.playbackId, playbackId, fadeInMs);
                            }
                        } else if (fadeInMs > 0) {
                            const delaySec = TimeMath.timeUntil(now, TimeMath.castToContextTime(regionStartTime));
                            this.controller.setVolume(playbackId, 0);
                            this.controller.fadeVolume(
                                playbackId,
                                1,
                                fadeInMs,
                                'equal-power',
                                TimeMath.secondsToMilliseconds(delaySec)
                            );
                        } else {
                            this.controller.setVolume(playbackId, 1);
                        }

                        track.state = LoopState.LOOPING;
                    } else if (fadeInMs > 0) {
                        const delaySec = TimeMath.timeUntil(now, TimeMath.castToContextTime(regionStartTime));
                        this.controller.setVolume(playbackId, 0);
                        this.controller.fadeVolume(
                            playbackId,
                            1,
                            fadeInMs,
                            'equal-power',
                            TimeMath.secondsToMilliseconds(delaySec)
                        );
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
                nextScheduleTime: 0 as Seconds,
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
        startOffsetSec = 0 as Seconds
    }: {
        soundId: SoundId;
        regionName: RegionId;
        targetTime: Seconds;
        track: TrackContext;
        startOffsetSec?: Seconds;
    }): PlaybackId | null {
        const config = this.router.getSoundConfig(soundId);
        if (isAbsent(config) || !('smartLoop' in config)) return null;

        const region = config.smartLoop.regions[regionName];
        if (isAbsent(region)) return null;

        const [startSample, endSample, preEntry = 0 as Milliseconds, tail = 0 as Milliseconds] = region;
        const sampleRate = this.controller.getSampleRate();

        const fullLogicalDurationSec = TimeMath.samplesToSeconds((endSample - startSample) as Samples, sampleRate);
        const safeStartOffsetSec = Math.min(startOffsetSec, fullLogicalDurationSec) as Seconds;

        const preEntrySec = safeStartOffsetSec > 0 ? (0 as Seconds) : TimeMath.msToSeconds(preEntry);
        const tailSec = TimeMath.msToSeconds(tail);

        const logicalDurationSec = (fullLogicalDurationSec - safeStartOffsetSec) as Seconds;
        const logicalOffsetSec = (TimeMath.samplesToSeconds(startSample, sampleRate) + safeStartOffsetSec) as Seconds;

        let actualOffsetSec = Math.max(0, logicalOffsetSec - preEntrySec) as Seconds;

        let actualDurationSec = (logicalDurationSec + (logicalOffsetSec - actualOffsetSec) + tailSec) as Seconds;

        let actualTargetTime = (targetTime - preEntrySec) as Seconds;
        let logicalScheduledTime = targetTime;

        const now = TimeMath.castToSeconds(this.controller.getCurrentTime());

        if (actualTargetTime < now) {
            if (isAbsent(track.gridStartTime) && targetTime === 0) {
                actualTargetTime = now;
                logicalScheduledTime = (now + preEntrySec) as Seconds;
            } else {
                const missedSec = (now - actualTargetTime) as Seconds;
                if (now >= targetTime) {
                    actualOffsetSec = (logicalOffsetSec + (now - targetTime)) as Seconds;
                    actualDurationSec = Math.max(0, logicalDurationSec - (now - targetTime) + tailSec) as Seconds;
                    actualTargetTime = now;
                } else {
                    actualOffsetSec = (actualOffsetSec + missedSec) as Seconds;
                    actualDurationSec = (actualDurationSec - missedSec) as Seconds;
                    actualTargetTime = now;
                }
            }
        }

        const playbackId = this.controller.play(soundId, {
            when: TimeMath.castToContextTime(actualTargetTime),
            offset: actualOffsetSec,
            duration: actualDurationSec
        });

        if (isAbsent(playbackId)) {
            console.warn(`[Sequencer] Failed to schedule region ${regionName} for ${soundId} (voice dropped).`);
            track.nextScheduleTime = (logicalScheduledTime + logicalDurationSec) as Seconds;
            return null;
        }

        this.router.applyConfigToPlayback(playbackId, config);

        track.gridStartTime ??= logicalScheduledTime;
        track.nextScheduleTime = (logicalScheduledTime + logicalDurationSec) as Seconds;

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
        this.ticker.add('sequencer' as TickerTaskId, Sequencer.TICK_DIVIDER, this);
    }
}
