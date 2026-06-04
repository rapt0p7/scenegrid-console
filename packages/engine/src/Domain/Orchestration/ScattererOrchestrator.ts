import { isDefined, isAbsent } from '@scene-grid/shared';
import type { IContainerSoundConfig, IScattererSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { PlaybackId, IPRNG } from '@scene-grid/shared';
import type ContainerPlaybackPolicy from '@domain/Managers/ContainerPlaybackPolicy.js';

interface ActiveScatterer {
    readonly playbackId: PlaybackId;
    readonly config: IScattererSoundConfig;
    nextSpawnTimeMs: number;
    spawnedPlaybacks: PlaybackId[];
    spawnCount: number;
}

export class ScattererOrchestrator implements ITickable {
    public readonly TICK_RATE_MS: number = 16;

    private readonly activeSessions: ActiveScatterer[] = [];

    constructor(
        private readonly router: IAudioRouter,
        private readonly soundController: ISoundController,
        private readonly sequencer: ISequencer,
        private readonly containerPolicy: ContainerPlaybackPolicy,
        private readonly prng: IPRNG
    ) {}

    public start(playbackId: PlaybackId, config: IScattererSoundConfig, currentTime: number): void {
        this.activeSessions.push({
            playbackId,
            config,
            nextSpawnTimeMs: this.calculateNextSpawnTime(config, currentTime),
            spawnedPlaybacks: Array.from({ length: config.maxPolyphony ?? 16 }),
            spawnCount: 0
        });
    }

    public tick(currentTime: number, deltaTimeMs: number): void {
        const currentTimeMs = currentTime * 1000;
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
                session.nextSpawnTimeMs += deltaTimeMs;
                continue;
            }

            if (currentTimeMs >= session.nextSpawnTimeMs) {
                this.spawn(session);
                session.nextSpawnTimeMs = this.calculateNextSpawnTime(session.config, currentTimeMs);
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

    private calculateNextSpawnTime(config: IScattererSoundConfig, currentTime: number): number {
        const [minMs, maxMs] = config.spawnRateMs;
        const rawNextTime = currentTime + this.prng.nextRange(minMs, maxMs);

        if (isDefined(config.sync)) {
            const gridInfo = this.sequencer.getPlaybackInfo?.(config.sync.referenceTrackId);

            if (isDefined(gridInfo)) {
                return config.sync.quantize === 'NextBar'
                    ? gridInfo.grid.getNextBarTime(rawNextTime)
                    : gridInfo.grid.getNextBeatTime(rawNextTime);
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
