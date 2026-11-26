// oxlint-disable max-lines-per-function
// noinspection D

import type { IContainerSoundConfig, IScattererSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type ContainerPlaybackPolicy from '@domain/Managers/ContainerPlaybackPolicy.js';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { PlaybackId, IPRNG, ContextTime, Milliseconds, Pulses } from '@scene-grid/shared';

import { isDefined, isAbsent } from '@scene-grid/shared';
import { TimeMath } from '@scene-grid/shared';

interface ActiveScatterer {
    readonly playbackId: PlaybackId;
    readonly config: IScattererSoundConfig;
    nextSpawnTime: Milliseconds;
    spawnedPlaybacks: PlaybackId[];
    spawnCount: number;
}

export class ScattererOrchestrator implements ITickable {
    public readonly TICK_DIVIDER: number = 1;

    private readonly activeSessions: ActiveScatterer[] = [];

    constructor(
        private readonly router: IAudioRouter,
        private readonly soundController: ISoundController,
        private readonly sequencer: ISequencer,
        private readonly containerPolicy: ContainerPlaybackPolicy,
        private readonly prng: IPRNG
    ) {}

    public start(playbackId: PlaybackId, config: IScattererSoundConfig, currentTime: ContextTime): void {
        const currentTimeMs = TimeMath.secondsToMilliseconds(TimeMath.castToSeconds(currentTime));

        this.activeSessions.push({
            playbackId,
            config,
            nextSpawnTime: this.calculateNextSpawnTime(config, currentTimeMs),
            spawnedPlaybacks: Array.from({ length: config.maxPolyphony ?? 16 }),
            spawnCount: 0
        });
    }

    public tick(currentTime: ContextTime, deltaTime: Milliseconds): void {
        const currentTimeMs = TimeMath.secondsToMilliseconds(TimeMath.castToSeconds(currentTime));
        const { length } = this.activeSessions;

        for (let i = length - 1; i >= 0; i--) {
            const session = this.activeSessions[i];

            const logicalState = this.soundController.getLogicalState(session.playbackId);

            if (logicalState === undefined) {
                this.activeSessions[i] = this.activeSessions[this.activeSessions.length - 1];
                this.activeSessions.pop();
                continue;
            }

            if (logicalState === 'paused') {
                session.nextSpawnTime = (session.nextSpawnTime + deltaTime) as Milliseconds;
                continue;
            }

            if (currentTimeMs >= session.nextSpawnTime) {
                this.spawn(session);
                session.nextSpawnTime = this.calculateNextSpawnTime(session.config, currentTimeMs);
            }
        }
    }

    private spawn(session: ActiveScatterer): void {
        this.cleanupDeadVoices(session);

        if (isDefined(session.config.maxPolyphony) && session.spawnCount >= session.config.maxPolyphony) {
            return;
        }

        const containerConfig = {
            isContainer: true,
            mode: 'random_no_repeat',
            sources: session.config.sources
        } as unknown as IContainerSoundConfig;

        const evaluation = this.containerPolicy.evaluateNext(containerConfig);

        if (isAbsent(evaluation.soundId)) return;

        let x = 0;
        let z = 0;
        if (isDefined(session.config.scatterDistance)) {
            const [minDist, maxDist] = session.config.scatterDistance;
            const distance = this.prng.nextRange(minDist, maxDist);
            const angle = this.prng.nextRange(0, Math.PI * 2);
            x = Math.cos(angle) * distance;
            z = Math.sin(angle) * distance;
        }

        const spawnedId = this.router.play(evaluation.soundId);

        if (isDefined(spawnedId)) {
            const ids = Array.isArray(spawnedId) ? spawnedId : [spawnedId];
            for (const id of ids) {
                this.soundController.setPosition(id as PlaybackId, x, 0, z);
                session.spawnedPlaybacks[session.spawnCount++] = id as PlaybackId;
            }
        }
    }

    private calculateNextSpawnTime(config: IScattererSoundConfig, currentTime: Milliseconds): Milliseconds {
        const [minMs, maxMs] = config.spawnRate;
        const rawNextTime = (currentTime + this.prng.nextRange(minMs, maxMs)) as Milliseconds;

        if (isDefined(config.sync) && config.sync.quantize !== 'Immediate') {
            const gridInfo = this.sequencer.getPlaybackInfo?.(config.sync.referenceTrackId);

            if (isDefined(gridInfo)) {
                const rawContextTime = TimeMath.castToContextTime(TimeMath.msToSeconds(rawNextTime));
                const quantize = config.sync.quantize;
                let snappedTime: ContextTime;

                if (typeof quantize === 'string') {
                    snappedTime =
                        quantize === 'NextBar'
                            ? gridInfo.grid.getNextBarTime(rawContextTime)
                            : gridInfo.grid.getNextBeatTime(rawContextTime);
                } else if (quantize.type === 'NextGridDivision') {
                    snappedTime = gridInfo.grid.getNextDivisionTime(rawContextTime, quantize.division);
                } else {
                    const currentPulse = gridInfo.grid.getPulseAtTime(rawContextTime);
                    snappedTime = gridInfo.grid.getTimeAtPulse((currentPulse + quantize.pulseOffset) as Pulses);
                }

                return TimeMath.secondsToMilliseconds(TimeMath.castToSeconds(snappedTime));
            }
        }

        return rawNextTime;
    }

    private cleanupDeadVoices(session: ActiveScatterer): void {
        for (let i = session.spawnCount - 1; i >= 0; i--) {
            if (this.soundController.getPlaybackState(session.spawnedPlaybacks[i]) === 'stopped') {
                session.spawnedPlaybacks[i] = session.spawnedPlaybacks[--session.spawnCount];
            }
        }
    }
}
