// noinspection D

import { InstanceRTPCBinder } from '@domain/Managers/InstanceRTPCBinder.js';
import clamp from '@shared/clamp.js';

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type {
    AnySoundConfig,
    IBaseSoundConfig,
    IContainerSoundConfig,
    ILayeredSoundConfig,
    IPlayOptions
} from '@domain/Configuration/Ports/ISoundConfig.js';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import type ContainerManager from '@domain/Managers/ContainerManager.js';
import type DuckingManager from '@domain/Managers/DuckingManager.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController';
import type { BusId, PlaybackId, SoundId } from '@domain/Types/Branded';

export default class AudioRouter implements IAudioRouter {
    private readonly busSystem: IAudioBusSystem;
    private readonly duckingManager: DuckingManager;
    private readonly soundController: ISoundController;
    private readonly rtpcManager: IRTPCAdapter;
    private readonly containerManager: ContainerManager;
    private readonly soundMap: ISoundMap | null = null;

    constructor({
        soundController,
        busSystem,
        duckingManager,
        rtpcManager,
        containerManager,
        soundMap
    }: {
        soundController: ISoundController;
        busSystem: IAudioBusSystem;
        duckingManager: DuckingManager;
        rtpcManager: IRTPCAdapter;
        containerManager: ContainerManager;
        soundMap: ISoundMap;
    }) {
        this.soundController = soundController;
        this.busSystem = busSystem;
        this.duckingManager = duckingManager;
        this.rtpcManager = rtpcManager;
        this.containerManager = containerManager;
        this.soundMap = soundMap;
    }

    getSoundConfig(name: string): AnySoundConfig | null {
        return this.soundMap![name] ?? null;
    }

    public applyConfigToPlayback(playbackId: PlaybackId, config: AnySoundConfig): void {
        if (config.busId) {
            this.busSystem.routePlayback(playbackId, config.busId as BusId);
        }

        if ('ducking' in config && config.ducking?.target) {
            this.duckingManager.triggerDucking(playbackId, config.ducking.target, config.ducking.intensity ?? 1);
        }

        if ('rtpc' in config && config.rtpc) {
            InstanceRTPCBinder.bind(playbackId, config.rtpc, this.rtpcManager, this.soundController);
        }
    }

    play(name: SoundId, options: IPlayOptions = {}): PlaybackId | PlaybackId[] | null {
        const config = this.getSoundConfig(name);

        if (!config) {
            console.warn(`[AudioRouter] Sound "${name}" ignored: not found in config.`);
            return null;
        }

        if ('isContainer' in config && config.isContainer) {
            return this.handleContainer(name, config, options);
        }

        if ('isLayered' in config && config.isLayered) {
            return this.handleLayering(config, options);
        }

        const finalOptions = this.applyVariation(config, options);

        const playbackId = this.soundController.play(name, {
            when: (finalOptions.seek ?? 0) / 1000,
            offset: (finalOptions.seek ?? 0) / 1000,
            loop: finalOptions.isLoop,
            rate: finalOptions.rate,
            onRevive: (id: PlaybackId) => this.applyConfigToPlayback(id, config)
        });

        if (!playbackId) return null;

        this.applyConfigToPlayback(playbackId, config);

        return playbackId;
    }

    public stop(id: PlaybackId | PlaybackId[] | SoundId): void {
        if (Array.isArray(id)) {
            for (const index of id) this.soundController.stopById(index);
        } else if (typeof id === 'number') {
            this.soundController.stopById(id as PlaybackId);
        } else {
            this.soundController.stopAll(id);
        }
    }

    private handleContainer(name: SoundId, config: IContainerSoundConfig, options: IPlayOptions): PlaybackId | null {
        const nextSource = this.containerManager.getNextSource(name, config);
        if (!nextSource) return null;

        const finalOptions = this.applyVariation(config, options);

        const playbackId = this.soundController.play(nextSource, {
            when: (finalOptions.seek ?? 0) / 1000,
            offset: (finalOptions.seek ?? 0) / 1000,
            loop: finalOptions.isLoop,
            rate: finalOptions.rate,
            onRevive: (id: PlaybackId) => this.applyConfigToPlayback(id, config)
        });

        if (!playbackId) return null;

        this.applyConfigToPlayback(playbackId, config);

        return playbackId;
    }

    private handleLayering(config: ILayeredSoundConfig, options: IPlayOptions): PlaybackId[] | null {
        const playbackIds: PlaybackId[] = [];
        for (const layer of config.layers) {
            const finalOptions = this.applyVariation(config, {
                ...options,
                ...layer
            });

            const playbackId = this.soundController.play(layer.src, {
                when: (layer.delayMs ?? 0) / 1000,
                offset: ((finalOptions.seek ?? 0) || 0) / 1000,
                loop: finalOptions.isLoop,
                rate: finalOptions.rate,
                onRevive: (id: PlaybackId) => this.applyConfigToPlayback(id, config)
            });

            if (!playbackId) continue;

            this.applyConfigToPlayback(playbackId, config);
            playbackIds.push(playbackId);
        }

        return playbackIds.length > 0 ? playbackIds : null;
    }

    private applyVariation(config: IBaseSoundConfig, options: IPlayOptions): IPlayOptions {
        if (!config.variation) return { ...options };

        const v = config.variation;
        const final: IPlayOptions = { ...options };

        if (v.pitchVar) {
            const delta = (Math.random() * 2 - 1) * v.pitchVar;
            final.rate = clamp((final.rate ?? 1) + delta, 0.1, 4);
        }

        if (v.volumeVar) {
            const delta = (Math.random() * 2 - 1) * v.volumeVar;
            final.volume = clamp((final.volume ?? 1) + delta, 0, 1);
        }

        if (v.randomOffset) {
            final.seek = Math.random() * v.randomOffset;
        }

        return final;
    }
}
