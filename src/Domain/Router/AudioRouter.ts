// oxlint-disable import/max-dependencies
// noinspection D

import { InstanceRTPCBinder } from '@domain/Managers/InstanceRTPCBinder.js';
import { VariationResolver } from '@domain/Router/VariationResolver.js';

import type {
    AnySoundConfig,
    IContainerSoundConfig,
    ILayeredSoundConfig,
    IPlayOptions,
    IScattererSoundConfig,
    ISwitchSoundConfig
} from '@domain/Configuration/Ports/ISoundConfig.js';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import type ContainerPlaybackPolicy from '@domain/Managers/ContainerPlaybackPolicy.js';
import type SwitchPlaybackPolicy from '@domain/Managers/SwitchPlaybackPolicy.js';
import type { IContainerHistoryRegistry } from '@domain/Managers/Ports/IContainerHistoryRegistry.js';
import type { IDuckingManager } from '@domain/Managers/Ports/IDuckingManager.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { PlaybackId, SoundId } from '@shared/Types/Branded.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { IStopOptions } from '@domain/Configuration/Ports/IEventConfig.js';
import { ScattererOrchestrator } from '@domain/Orchestration/ScattererOrchestrator.js';
import { isAbsent } from '@shared/guards.js';
import type { IPRNG } from '@shared/Math/SeededPRNG.js';

export default class AudioRouter implements IAudioRouter {
    private readonly duckingManager: IDuckingManager;
    private readonly soundController: ISoundController;
    private readonly containerPolicy: ContainerPlaybackPolicy;
    private readonly historyRegistry: IContainerHistoryRegistry;
    private readonly soundMap: ISoundMap | null = null;
    private readonly instanceRTPCBinder: InstanceRTPCBinder;
    private readonly rtpcAdapter: IRTPCAdapter;
    private readonly switchPolicy: SwitchPlaybackPolicy;
    private scattererOrchestrator?: ScattererOrchestrator;
    private readonly prng: IPRNG;

    constructor({
        soundController,
        duckingManager,
        containerPolicy,
        historyRegistry,
        soundMap,
        rtpcAdapter,
        instanceRTPCBinder,
        switchPolicy,
        prng
    }: {
        soundController: ISoundController;
        duckingManager: IDuckingManager;
        containerPolicy: ContainerPlaybackPolicy;
        historyRegistry: IContainerHistoryRegistry;
        soundMap: ISoundMap;
        rtpcAdapter: IRTPCAdapter;
        instanceRTPCBinder: InstanceRTPCBinder;
        switchPolicy: SwitchPlaybackPolicy;
        prng: IPRNG;
    }) {
        this.soundController = soundController;
        this.duckingManager = duckingManager;
        this.containerPolicy = containerPolicy;
        this.historyRegistry = historyRegistry;
        this.soundMap = soundMap;
        this.instanceRTPCBinder = instanceRTPCBinder;
        this.rtpcAdapter = rtpcAdapter;
        this.switchPolicy = switchPolicy;
        this.prng = prng;
    }

    getSoundConfig(name: SoundId): AnySoundConfig | null {
        return this.soundMap![name] ?? null;
    }

    public applyConfigToPlayback(playbackId: PlaybackId, config: AnySoundConfig): void {
        if (config.busId) {
            this.soundController.routeToBus(playbackId, config.busId);
        }

        if ('ducking' in config && config.ducking?.target) {
            this.duckingManager.triggerDucking(playbackId, config.ducking.target, config.ducking.intensity ?? 1);
        }

        if ('rtpc' in config && config.rtpc) {
            this.instanceRTPCBinder.bind(playbackId, config.rtpc);
        }
    }

    public setScattererOrchestrator(orchestrator: ScattererOrchestrator): void {
        this.scattererOrchestrator = orchestrator;
    }

    play(name: SoundId, options: IPlayOptions = {}, depth: number = 0): PlaybackId | PlaybackId[] | null {
        if (depth > 10) {
            console.error(`[AudioRouter] Max recursion depth reached for: ${name}`);
            return null;
        }

        const config = this.getSoundConfig(name);

        if (!config) {
            console.warn(`[AudioRouter] Sound "${name}" ignored: not found in config.`);
            return null;
        }

        if ('isContainer' in config && config.isContainer) {
            return this.handleContainer(name, config, options, depth);
        }

        if ('isLayered' in config && config.isLayered) {
            return this.handleLayering(config, options);
        }

        if ('isSwitch' in config && config.isSwitch) {
            return this.handleSwitch(name, config, options, depth);
        }

        if ('isScatterer' in config && config.isScatterer) {
            return this.handleScatterer(name, config);
        }

        const finalOptions = VariationResolver.apply(config, options, this.prng);

        const playbackId = this.soundController.play(name, {
            when: (finalOptions.delayMs ?? 0) / 1000,
            offset: (finalOptions.seek ?? 0) / 1000,
            loop: finalOptions.isLoop,
            rate: finalOptions.rate,
            onRevive: (id: PlaybackId) => {
                this.applyConfigToPlayback(id, config);
            }
        });

        if (!playbackId) return null;

        this.applyConfigToPlayback(playbackId, config);

        return playbackId;
    }

    public stop(id: PlaybackId | PlaybackId[] | SoundId, options?: IStopOptions): void {
        const playbacksToStop = this.resolvePlaybacks(id);
        const allowTail = options?.allowTail ?? true;
        const timeToStop = options?.fadeOutMs;

        const length = playbacksToStop.length;
        for (let i = 0; i < length; i++) {
            const playbackId = playbacksToStop[i];
            const soundId = this.soundController.getSoundId(playbackId);

            if (!soundId) {
                this.soundController.stopById(playbackId, timeToStop);
                continue;
            }

            const config = this.getSoundConfig(soundId);

            if (allowTail && config && 'tail' in config && config.tail) {
                const position = this.soundController.getPosition(playbackId);
                const tailPlaybackIds = this.play(config.tail);

                if (position && tailPlaybackIds) {
                    const ids = Array.isArray(tailPlaybackIds) ? tailPlaybackIds : [tailPlaybackIds];
                    for (let j = 0; j < ids.length; j++) {
                        this.soundController.setPosition(ids[j], position.x, position.y, position.z);
                    }
                }
            }

            this.soundController.stopById(playbackId, timeToStop);
        }
    }

    public pause(id: PlaybackId | PlaybackId[] | SoundId): void {
        if (Array.isArray(id)) {
            for (const index of id) this.soundController.pauseById(index);
        } else if (typeof id === 'number') {
            this.soundController.pauseById(id);
        } else {
            this.soundController.pauseAll(id);
        }
    }

    public resume(id: PlaybackId | PlaybackId[] | SoundId): void {
        if (Array.isArray(id)) {
            for (const index of id) this.soundController.resumeById(index);
        } else if (typeof id === 'number') {
            this.soundController.resumeById(id);
        } else {
            this.soundController.resumeAll(id);
        }
    }

    private resolvePlaybacks(target: PlaybackId | PlaybackId[] | SoundId): PlaybackId[] {
        if (Array.isArray(target)) {
            return target;
        }

        if (typeof target === 'number') {
            return [target];
        }

        const activeIds = this.soundController.getActivePlaybacks();
        const result: PlaybackId[] = [];
        const length = activeIds.length;

        for (let i = 0; i < length; i++) {
            if (this.soundController.getSoundId(activeIds[i]) === target) {
                result.push(activeIds[i]);
            }
        }

        return result;
    }

    private handleScatterer(name: SoundId, config: IScattererSoundConfig): PlaybackId | null {
        if (isAbsent(this.scattererOrchestrator)) {
            console.warn(`[AudioRouter] Cannot play scatterer ${name}: Orchestrator not initialized.`);
            return null;
        }
        const virtualPlaybackId = this.soundController.playVirtual(name);

        const currentTime = this.soundController.getCurrentTime() * 1000;
        this.scattererOrchestrator.start(virtualPlaybackId, config, currentTime);

        return virtualPlaybackId;
    }

    private handleContainer(
        name: SoundId,
        config: IContainerSoundConfig,
        options: IPlayOptions,
        depth: number
    ): PlaybackId | PlaybackId[] | null {
        if (depth > 10) {
            console.error(`[AudioRouter] Max recursion depth reached for container: ${name}`);
            return null;
        }

        const history = this.historyRegistry.getHistory(name);
        const { soundId: nextSource, nextState } = this.containerPolicy.evaluateNext(config, history);

        if (!nextSource) return null;

        this.historyRegistry.updateHistory(name, nextState);

        const finalOptions = VariationResolver.apply(config, options, this.prng);

        const playbackResult = this.play(nextSource, finalOptions, depth + 1);

        if (!playbackResult) return null;

        if (Array.isArray(playbackResult)) {
            const { length } = playbackResult;
            for (let i = 0; i < length; i++) {
                this.applyConfigToPlayback(playbackResult[i], config);
            }
        } else {
            this.applyConfigToPlayback(playbackResult, config);
        }

        return playbackResult;
    }

    private handleLayering(config: ILayeredSoundConfig, options: IPlayOptions): PlaybackId[] | null {
        const playbackIds: PlaybackId[] = [];
        for (const layer of config.layers) {
            const finalOptions = VariationResolver.apply(
                config,
                {
                    ...options,
                    ...layer
                },
                this.prng
            );

            const playbackId = this.soundController.play(layer.src, {
                when: (layer.delayMs ?? 0) / 1000,
                offset: ((finalOptions.seek ?? 0) || 0) / 1000,
                loop: finalOptions.isLoop,
                rate: finalOptions.rate,
                onRevive: (id: PlaybackId) => {
                    this.applyConfigToPlayback(id, config);
                }
            });

            if (!playbackId) continue;

            this.applyConfigToPlayback(playbackId, config);
            playbackIds.push(playbackId);
        }

        return playbackIds.length > 0 ? playbackIds : null;
    }

    private handleSwitch(
        name: SoundId,
        config: ISwitchSoundConfig,
        options: IPlayOptions,
        depth: number
    ): PlaybackId | PlaybackId[] | null {
        const currentValue = this.rtpcAdapter.getValue(config.switchGroup);
        const nextSource = this.switchPolicy.evaluate(config, currentValue);

        if (!nextSource) {
            console.warn(
                `[AudioRouter] Switch Container "${name}" failed to resolve. ` +
                    `Group: "${config.switchGroup}", Current Value: "${currentValue}". ` +
                    `Check your SoundMap for missing keys or add a defaultSwitch.`
            );
            return null;
        }

        const finalOptions = VariationResolver.apply(config, options, this.prng);
        const playbackResult = this.play(nextSource, finalOptions, depth + 1);

        if (!playbackResult) return null;

        if (Array.isArray(playbackResult)) {
            for (let i = 0; i < playbackResult.length; i++) {
                this.applyConfigToPlayback(playbackResult[i], config);
            }
        } else {
            this.applyConfigToPlayback(playbackResult, config);
        }

        return playbackResult;
    }
}
