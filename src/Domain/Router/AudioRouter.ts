// noinspection D

import { InstanceRTPCBinder } from '@domain/Managers/InstanceRTPCBinder.js';
import { VariationResolver } from '@domain/Router/VariationResolver.js';

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type {
    AnySoundConfig,
    IContainerSoundConfig,
    ILayeredSoundConfig,
    IPlayOptions
} from '@domain/Configuration/Ports/ISoundConfig.js';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import type { IContainerManager } from '@domain/Managers/Ports/IContainerManager.js';
import type { IDuckingManager } from '@domain/Managers/Ports/IDuckingManager.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { BusId, PlaybackId, SoundId } from '@domain/Types/Branded.js';

export default class AudioRouter implements IAudioRouter {
    private readonly busSystem: IAudioBusSystem;
    private readonly duckingManager: IDuckingManager;
    private readonly soundController: ISoundController;
    private readonly rtpcManager: IRTPCAdapter;
    private readonly containerManager: IContainerManager;
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
        duckingManager: IDuckingManager;
        rtpcManager: IRTPCAdapter;
        containerManager: IContainerManager;
        soundMap: ISoundMap;
    }) {
        this.soundController = soundController;
        this.busSystem = busSystem;
        this.duckingManager = duckingManager;
        this.rtpcManager = rtpcManager;
        this.containerManager = containerManager;
        this.soundMap = soundMap;
    }

    getSoundConfig(name: SoundId): AnySoundConfig | null {
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

        const finalOptions = VariationResolver.apply(config, options);

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

        const finalOptions = VariationResolver.apply(config, options);

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
            const finalOptions = VariationResolver.apply(config, {
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
}
