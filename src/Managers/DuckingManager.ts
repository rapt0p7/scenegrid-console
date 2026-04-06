// noinspection D

import type AudioBusSystem from '../BusSystem/AudioBusSystem.js';
import type { AudioNodeLike, ISoundInstance, ISidechain } from '@webaudio-core';

interface ActiveSidechain {
    sidechain: ISidechain;
    intensity: number;
    node: AudioNodeLike;
}

type DuckingToken = symbol;

export default class DuckingManager {
    private readonly busSystem: AudioBusSystem;
    private readonly activeSources = new Map<DuckingToken, ActiveSidechain[]>();

    constructor(busSystem: AudioBusSystem) {
        this.busSystem = busSystem;
    }

    clearAll(): void {
        for (const entries of this.activeSources.values()) {
            for (const { sidechain, node } of entries) {
                try {
                    sidechain.removeSource(node);
                } catch {
                    /* empty */
                }
            }
        }
        this.activeSources.clear();
    }

    triggerDucking(
        instance: ISoundInstance,
        targetBusIdOrArray: string | string[],
        intensity: number | number[] = 1
    ): void {
        const token = Symbol('ducking');
        const targets = Array.isArray(targetBusIdOrArray) ? targetBusIdOrArray : [targetBusIdOrArray];

        const intensities: number[] = Array.isArray(intensity)
            ? intensity
            : Array.from<number>({ length: targets.length }).fill(intensity);

        const node = instance.instanceGain;
        if (!node) return;

        const sourceSidechains: ActiveSidechain[] = [];

        for (const [index, busId] of targets.entries()) {
            const sidechain = this.busSystem.getSidechain(busId);
            if (!sidechain) continue;

            const currentIntensity = intensities[index] ?? 1;

            try {
                sidechain.addSource(node, currentIntensity);
                sourceSidechains.push({
                    sidechain,
                    intensity: currentIntensity,
                    node
                });
            } catch (error) {
                console.warn(`[DuckingManager] Failed to add source to sidechain "${busId}"`, error);
            }
        }

        if (sourceSidechains.length === 0) return;

        this.activeSources.set(token, sourceSidechains);

        const cleanup = (): void => this.cleanupInstance(token);

        instance.on('ended', cleanup);
        instance.on('stopped', cleanup);
        instance.on('disposed', cleanup);
    }

    private cleanupInstance(token: symbol): void {
        const entries = this.activeSources.get(token);
        if (!entries) return;

        for (const { sidechain, node } of entries) {
            try {
                sidechain.removeSource(node);
            } catch {
                /* empty */
            }
        }

        this.activeSources.delete(token);
    }
}
