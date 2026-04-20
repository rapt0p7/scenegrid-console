// noinspection D

import AudioGrid from '@domain/Orchestration/AudioGrid.js';
import { LoopState } from '@domain/Orchestration/Ports/ISequencer.js';

import type { ITransitionToParameters, ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IEngineTicker } from '@domain/Shared/Ports/IEngineTicker.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { PlaybackId, SoundId } from '@domain/Types/Branded.js';
import { DeepReadonly } from '@shared/DeepReadonly.js';
import { isDefined, isAbsent } from '@shared/guards.js';

interface ActiveRegion {
    playbackId: PlaybackId;
    scheduledStartTime: number;
    unsubscribe: () => void;
}

interface QueuedRegion {
    name: string;
    fadeInDurationMs: number;
}

interface TrackContext {
    soundId: SoundId;
    state: LoopState;
    playId: number;
    nextScheduleTime: number;
    activeRegions: Set<ActiveRegion>;
    gridStartTime: number | null;
    regionQueue: QueuedRegion[];
    loopRegion: string | null;
}

export default class Sequencer implements ISequencer {
    private tracks: Map<SoundId, TrackContext> = new Map();
    private readonly scheduleIntervalMs = 25;
    private readonly lookaheadWindowSec = 0.1;

    constructor(
        private readonly controller: ISoundController,
        private readonly router: IAudioRouter,
        private readonly ticker: IEngineTicker
    ) {
        this.startScheduler();
    }

    playLoop(soundId: SoundId, regionName: string): void {
        this.stopLoop(soundId);
        const track = this.getTrackContext(soundId);
        track.playId++;
        track.state = LoopState.LOOPING;
        track.nextScheduleTime = 0;
        track.gridStartTime = null;
        track.regionQueue = [];
        track.loopRegion = regionName;

        this.processTick();
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
    transitionTo({
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
        const stopTime = targetTime + crossfadeSec;

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

            if (crossfadeMs > 0) {
                const delayMsToFade = Math.max(0, (targetTime - now) * 1000);
                this.controller.fadeVolume(active.playbackId, 0, crossfadeMs, 'equal-power', delayMsToFade);
                this.controller.stopById(active.playbackId, stopTime);
            } else {
                this.controller.stopById(active.playbackId, targetTime);
            }
        }

        track.activeRegions.clear();
        track.regionQueue = [];
        track.nextScheduleTime = targetTime;

        if (isDefined(transitionRegionName) && transitionRegionName !== '') {
            track.regionQueue.push(
                { name: transitionRegionName, fadeInDurationMs: crossfadeMs },
                { name: targetRegion, fadeInDurationMs: 0 }
            );
        } else {
            track.regionQueue.push({ name: targetRegion, fadeInDurationMs: crossfadeMs });
        }

        track.loopRegion = targetRegion;
        track.state = LoopState.LOOPING;

        this.processTick();
    }

    private processTick(): void {
        for (const [soundId, track] of this.tracks.entries()) {
            if (track.state !== LoopState.LOOPING) continue;

            const now = this.controller.getCurrentTime();
            const scheduleHorizon = now + this.lookaheadWindowSec;

            while (track.nextScheduleTime < scheduleHorizon) {
                let nextRegionName: string | null = null;
                let fadeInMs = 0;

                if (track.regionQueue.length > 0) {
                    const queued = track.regionQueue.shift()!;
                    nextRegionName = queued.name;
                    fadeInMs = queued.fadeInDurationMs;
                } else if (isDefined(track.loopRegion)) {
                    nextRegionName = track.loopRegion;
                }

                if (isAbsent(nextRegionName)) break;

                const regionStartTime = track.nextScheduleTime;
                const playbackId = this.scheduleRegion({
                    soundId,
                    regionName: nextRegionName,
                    targetTime: regionStartTime,
                    track
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
                loopRegion: null
            });
        }
        return this.tracks.get(soundId)!;
    }

    // oxlint-disable-next-line typescript/prefer-readonly-parameter-types, max-lines-per-function
    private scheduleRegion({
        soundId,
        regionName,
        targetTime,
        track
    }: {
        soundId: SoundId;
        regionName: string;
        targetTime: number;
        track: TrackContext;
    }): PlaybackId | null {
        const config = this.router.getSoundConfig(soundId);
        if (isAbsent(config) || !('smartLoop' in config)) return null;

        const region = config.smartLoop.regions[regionName];
        if (isAbsent(region)) return null;

        const [startSample, endSample] = region;
        const sampleRate = this.controller.getSampleRate();
        const durationSec = (endSample - startSample) / sampleRate;
        const offsetSec = startSample / sampleRate;

        const now = this.controller.getCurrentTime();
        let delaySec = 0;
        if (targetTime > 0) {
            delaySec = Math.max(0, targetTime - now);
        }

        const playbackId = this.controller.play(soundId, {
            when: delaySec,
            offset: offsetSec,
            duration: durationSec
        });

        if (isAbsent(playbackId)) {
            console.warn(`[Sequencer] Failed to schedule region ${regionName} for ${soundId} (voice dropped).`);

            track.nextScheduleTime = targetTime + durationSec;

            return null;
        }

        this.router.applyConfigToPlayback(playbackId, config);

        targetTime = now + delaySec;

        track.gridStartTime ??= targetTime;

        track.nextScheduleTime = targetTime + durationSec;

        const activeRegion: ActiveRegion = {
            playbackId,
            scheduledStartTime: targetTime,
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
        this.ticker.add('sequencer', this.scheduleIntervalMs, () => {
            this.processTick();
        });
    }
}
