// noinspection D

import { clamp } from '@webaudio-core';

import { InstanceRTPCBinder } from './Managers/InstanceRTPCBinder';

import type AudioBusSystem from './BusSystem/AudioBusSystem';
import type { BusId } from './interfaces/IAudioBusSystem';
import type { IAudioRouter } from './interfaces/IAudioRouter';
import type { IRTPCManager } from './interfaces/IRTPCManager';
import type {
    AnySoundConfig,
    IBaseSoundConfig,
    IContainerSoundConfig,
    ILayeredSoundConfig,
    IPlayOptions
} from './interfaces/ISoundConfig';
import type { ISoundMap } from './interfaces/ISoundMap';
import type ContainerManager from './Managers/ContainerManager';
import type DuckingManager from './Managers/DuckingManager';
import type { SoundController, ISoundInstance } from '@webaudio-core';

export default class AudioRouter implements IAudioRouter {
    private readonly busSystem: AudioBusSystem;
    private readonly duckingManager: DuckingManager;
    private readonly soundController: SoundController;
    private readonly rtpcManager: IRTPCManager;
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
        soundController: SoundController;
        busSystem: AudioBusSystem;
        duckingManager: DuckingManager;
        rtpcManager: IRTPCManager;
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

    public applyConfigToInstance(instance: ISoundInstance, config: AnySoundConfig): void {
        if (config.busId) {
            this.busSystem.routeInstance(instance, config.busId as BusId);
        }

        if ('ducking' in config && config.ducking?.target) {
            this.duckingManager.triggerDucking(instance, config.ducking.target, config.ducking.intensity ?? 1);
        }

        if ('rtpc' in config && config.rtpc) {
            InstanceRTPCBinder.bind(instance, config.rtpc, this.rtpcManager);
        }
    }

    play(name: string, options: IPlayOptions = {}): number | number[] | null {
        const config = this.getSoundConfig(name);

        if (!config) {
            console.warn(`[AudioRouter] Sound "${name}" ignored: not found in config.`);
            return null;
        }

        if ('isContainer' in config && config.isContainer) {
            return this.handleContainer(name, config, options) ? 1 : null;
        }

        if ('isLayered' in config && config.isLayered) {
            return this.handleLayering(config, options);
        }

        const finalOptions = this.applyVariation(config, options);

        const result = this.soundController.play(name, {
            when: (finalOptions.seek ?? 0) / 1000,
            offset: (finalOptions.seek ?? 0) / 1000,
            loop: finalOptions.isLoop,
            rate: finalOptions.rate,
            onRevive: instance => this.applyConfigToInstance(instance, config)
        });

        if (!result) return null;

        this.applyConfigToInstance(result.instance, config);

        return result.playbackId;
    }

    public stop(id: number | number[] | string): void {
        if (Array.isArray(id)) {
            for (const index of id) this.soundController.stopById(index);
        } else if (typeof id === 'number') {
            this.soundController.stopById(id);
        } else {
            this.soundController.stopAll(id);
        }
    }

    private handleContainer(name: string, config: IContainerSoundConfig, options: IPlayOptions): number | null {
        const nextSource = this.containerManager.getNextSource(name, config);
        if (!nextSource) return null;

        const finalOptions = this.applyVariation(config, options);

        const result = this.soundController.play(nextSource, {
            when: (finalOptions.seek ?? 0) / 1000,
            offset: (finalOptions.seek ?? 0) / 1000,
            loop: finalOptions.isLoop,
            rate: finalOptions.rate,
            onRevive: instance => this.applyConfigToInstance(instance, config)
        });

        if (!result) return null;

        this.applyConfigToInstance(result.instance, config);

        return result.playbackId;
    }

    private handleLayering(config: ILayeredSoundConfig, options: IPlayOptions): number[] | null {
        const playbackIds: number[] = [];
        for (const layer of config.layers) {
            const finalOptions = this.applyVariation(config, {
                ...options,
                ...layer
            });

            const result = this.soundController.play(layer.src, {
                when: (layer.delayMs ?? 0) / 1000,
                offset: ((finalOptions.seek ?? 0) || 0) / 1000,
                loop: finalOptions.isLoop,
                rate: finalOptions.rate,
                onRevive: instance => this.applyConfigToInstance(instance, config)
            });

            if (!result) continue;

            this.applyConfigToInstance(result.instance, config);
            playbackIds.push(result.playbackId);
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
