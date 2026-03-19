// noinspection D

import * as workerTimers from 'worker-timers';

import { LoopState } from '../interfaces/ISmartLoopManager';

import AudioGrid from './AudioGrid';

import type { IAudioRouter } from '../interfaces/IAudioRouter';
import type { ITransitionToParameters } from '../interfaces/ISmartLoopManager';
import type { SoundController, ISoundInstance, AutomationEngine } from '@webaudio-core';

interface ActiveRegion {
    instance: ISoundInstance;
    scheduledStartTime: number;
    unsubscribe: () => void;
}

interface QueuedRegion {
    name: string;
    fadeInDurationMs: number;
}

interface TrackContext {
    soundId: string;
    state: LoopState;
    playId: number;
    referenceContext: AudioContext | null;
    nextScheduleTime: number;
    activeRegions: Set<ActiveRegion>;
    gridStartTime: number | null;
    regionQueue: QueuedRegion[];
    loopRegion: string | null;
}

export default class SmartLoopManager {
    private readonly controller: SoundController;
    private readonly router: IAudioRouter;
    private readonly automation: AutomationEngine;
    private tracks: Map<string, TrackContext> = new Map();
    private readonly scheduleIntervalMs = 25;
    private readonly lookaheadWindowSec = 0.1;
    private timerId: number | null = null;

    constructor(soundController: SoundController, audioRouter: IAudioRouter, automationEngine: AutomationEngine) {
        this.controller = soundController;
        this.router = audioRouter;
        this.automation = automationEngine;

        this.startScheduler();
    }

    playLoop(soundId: string, regionName: string): void {
        this.stopLoop(soundId);

        const track = this.getTrackContext(soundId);
        track.playId++;
        track.state = LoopState.LOOPING;
        track.referenceContext = null;
        track.nextScheduleTime = 0;
        track.gridStartTime = null;

        track.regionQueue = [];
        track.loopRegion = regionName;

        this.processTick();
    }

    stopLoop(soundId: string): void {
        const track = this.tracks.get(soundId);
        if (!track || track.state === LoopState.IDLE) return;

        track.playId++;
        track.state = LoopState.IDLE;

        track.referenceContext = null;
        track.nextScheduleTime = 0;
        track.gridStartTime = null;

        track.regionQueue = [];
        track.loopRegion = null;

        for (const active of track.activeRegions) {
            try {
                active.unsubscribe();
            } catch {
                /* empty */
            }
            try {
                active.instance.cancelScheduled();
            } catch {
                /* empty */
            }
        }

        track.activeRegions.clear();
    }

    public destroy(): void {
        if (this.timerId !== null) {
            workerTimers.clearInterval(this.timerId);
            this.timerId = null;
        }
    }

    // eslint-disable-next-line complexity
    transitionTo({
        soundId,
        targetRegion,
        transitionRegionName,
        options = { interruptable: true, quantize: 'Immediate' }
    }: ITransitionToParameters): void {
        const track = this.getTrackContext(soundId);
        if (track.state === LoopState.IDLE) return;
        if (track.state === LoopState.TRANSITIONING && !options.interruptable) return;

        const config = this.router.getSoundConfig(soundId);
        if (!config || !('smartLoop' in config)) return;

        track.playId++;
        track.state = LoopState.TRANSITIONING;

        const now = track.referenceContext ? track.referenceContext.currentTime : 0;
        let targetTime = now;

        if (options.quantize && options.quantize !== 'Immediate' && track.referenceContext) {
            const interval = options.quantizeInterval ?? 1;
            let currentAnchorTime = track.gridStartTime || 0;

            for (const active of track.activeRegions) {
                if (active.scheduledStartTime <= now) {
                    currentAnchorTime = active.scheduledStartTime;
                }
            }

            if (options.grid) {
                targetTime =
                    options.quantize === 'NextBeat'
                        ? options.grid.getNextBeatTime(now, interval)
                        : options.grid.getNextBarTime(now, interval);
            } else if (track.gridStartTime !== null) {
                const grid = new AudioGrid(
                    config.smartLoop.bpm || 60,
                    config.smartLoop.beatsPerBar || 4,
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
            } catch {
                /* empty */
            }

            if (active.scheduledStartTime >= targetTime) {
                try {
                    active.instance.cancelScheduled();
                } catch {
                    /* empty */
                }
                continue;
            }

            if (crossfadeMs > 0 && active.instance.instanceGain) {
                const delayMsToFade = Math.max(0, (targetTime - now) * 1000);
                this.automation.ramp(active.instance.instanceGain.gain, 0, crossfadeMs, 'equal-power', delayMsToFade);
                active.instance.stop(stopTime);
            } else {
                active.instance.stop(targetTime);
            }
        }

        track.activeRegions.clear();

        track.regionQueue = [];
        track.nextScheduleTime = targetTime;

        if (transitionRegionName) {
            track.regionQueue.push(
                {
                    name: transitionRegionName,
                    fadeInDurationMs: crossfadeMs
                },
                {
                    name: targetRegion,
                    fadeInDurationMs: 0
                }
            );
        } else {
            track.regionQueue.push({
                name: targetRegion,
                fadeInDurationMs: crossfadeMs
            });
        }

        track.loopRegion = targetRegion;
        track.state = LoopState.LOOPING;

        this.processTick();
    }

    private processTick(): void {
        for (const [soundId, track] of this.tracks.entries()) {
            if (track.state !== LoopState.LOOPING) continue;

            const now = track.referenceContext ? track.referenceContext.currentTime : 0;
            const scheduleHorizon = now + this.lookaheadWindowSec;

            while (track.nextScheduleTime < scheduleHorizon) {
                let nextRegionName: string | null = null;
                let fadeInMs = 0;

                if (track.regionQueue.length > 0) {
                    const queued = track.regionQueue.shift()!;
                    nextRegionName = queued.name;
                    fadeInMs = queued.fadeInDurationMs;
                } else if (track.loopRegion) {
                    nextRegionName = track.loopRegion;
                }

                if (!nextRegionName) break;

                const regionStartTime = track.nextScheduleTime;

                const instance = this.scheduleRegion({
                    soundId,
                    regionName: nextRegionName,
                    targetTime: regionStartTime,
                    track
                });

                if (instance && instance.instanceGain) {
                    const gainParameter = instance.instanceGain.gain;

                    if (fadeInMs > 0) {
                        const delayMsToFade = Math.max(0, (regionStartTime - now) * 1000);

                        this.automation.set(gainParameter, 0);
                        this.automation.ramp(gainParameter, 1, fadeInMs, 'equal-power', delayMsToFade);
                    } else {
                        this.automation.set(gainParameter, 1);
                    }
                }

                if (!track.referenceContext) break;
            }
        }
    }

    private getTrackContext(soundId: string): TrackContext {
        if (!this.tracks.has(soundId)) {
            this.tracks.set(soundId, {
                soundId,
                state: LoopState.IDLE,
                playId: 0,
                referenceContext: null,
                nextScheduleTime: 0,
                activeRegions: new Set(),
                gridStartTime: null,
                regionQueue: [],
                loopRegion: null
            });
        }
        return this.tracks.get(soundId)!;
    }

    private scheduleRegion({
        soundId,
        regionName,
        targetTime,
        track
    }: {
        soundId: string;
        regionName: string;
        targetTime: number;
        track: TrackContext;
    }): ISoundInstance | null {
        const config = this.router.getSoundConfig(soundId);
        if (!config || !('smartLoop' in config)) return null;

        const region = config.smartLoop.regions[regionName];
        if (!region) return null;

        const [startSample, endSample] = region;
        const sampleRate = track.referenceContext?.sampleRate || 44_100;
        const durationSec = (endSample - startSample) / sampleRate;
        const offsetSec = startSample / sampleRate;

        let delaySec = 0;
        if (track.referenceContext) {
            delaySec = Math.max(0, targetTime - track.referenceContext.currentTime);
        } else if (targetTime > 0) {
            delaySec = targetTime;
        }

        const result = this.controller.play(soundId, {
            when: delaySec,
            offset: offsetSec,
            duration: durationSec
        });

        if (!result) {
            console.warn(`[SmartLoopManager] Failed to schedule region ${regionName} for ${soundId} (voice dropped).`);
            // eslint-disable-next-line no-param-reassign
            track.nextScheduleTime = targetTime + durationSec;

            return null;
        }

        this.router.applyConfigToInstance(result.instance, config);

        if (!track.referenceContext && result.instance.outputNode && result.instance.outputNode.context) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line no-param-reassign
            track.referenceContext = result.instance.outputNode.context;
            // eslint-disable-next-line no-param-reassign
            targetTime = track.referenceContext!.currentTime + delaySec;

            if (track.gridStartTime === null) {
                // eslint-disable-next-line no-param-reassign
                track.gridStartTime = targetTime;
            }
        }
        // eslint-disable-next-line no-param-reassign
        track.nextScheduleTime = targetTime + durationSec;

        const activeRegion: ActiveRegion = {
            instance: result.instance,
            scheduledStartTime: targetTime,
            unsubscribe: () => {}
        };

        activeRegion.unsubscribe = result.instance.on('ended', () => {
            track.activeRegions.delete(activeRegion);
            try {
                activeRegion.unsubscribe();
            } catch {
                /* empty */
            }
        });

        track.activeRegions.add(activeRegion);
        return result.instance;
    }

    private startScheduler(): void {
        if (this.timerId !== null) return;

        this.timerId = workerTimers.setInterval(() => {
            this.processTick();
        }, this.scheduleIntervalMs);
    }
}
