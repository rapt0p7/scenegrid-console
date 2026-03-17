// noinspection D

import type { IFilter, IReverbConfig } from '../interfaces/IFilter';
import type {
    AudioBufferLike,
    AudioCtx,
    BiquadFilterNodeLike,
    ConvolverNodeNodeLike,
    AutomationEngine
} from '@webaudio-core';

export default class FiltersPlugin {
    private static impulseCache: Map<string, AudioBufferLike> = new Map();
    public static createNode(
        context: AudioCtx,
        automation: AutomationEngine,
        config: IFilter
    ): BiquadFilterNodeLike | ConvolverNodeNodeLike | null {
        if (!config.type) return null;

        if (config.type === 'reverb') {
            return this.createReverb(context, config);
        }

        const filter = context.createBiquadFilter();

        try {
            filter.type = (config.type as BiquadFilterType) || 'allpass';
        } catch {}

        if (config.frequency !== undefined) {
            automation.set(filter.frequency, config.frequency);
        }

        if (config.Q !== undefined) {
            automation.set(filter.Q, config.Q);
        }

        return filter;
    }

    private static createReverb(context: AudioCtx, config: IReverbConfig): ConvolverNodeNodeLike {
        const convolver = context.createConvolver();

        const time = config.reverbTime || 2;
        const decay = config.reverbDecay || 2;

        const cacheKey = `${time}_${decay}_${context.sampleRate}`;

        if (this.impulseCache.has(cacheKey)) {
            convolver.buffer = this.impulseCache.get(cacheKey)!;
        } else {
            const impulse = this.generateImpulseResponse(context, time, decay);
            this.impulseCache.set(cacheKey, impulse);
            convolver.buffer = impulse;
        }

        return convolver;
    }

    private static generateImpulseResponse(context: AudioCtx, duration: number, decay: number): AudioBufferLike {
        const sampleRate = context.sampleRate;
        const length = sampleRate * duration;
        const impulse = context.createBuffer(2, length, sampleRate);

        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        let lastOutL = 0;
        let lastOutR = 0;

        const dampening = 0.5;

        for (let index = 0; index < length; index++) {
            const n = index / length;
            const envelope = Math.pow(1 - n, decay);

            const noiseL = Math.random() * 2 - 1;
            const noiseR = Math.random() * 2 - 1;

            lastOutL = noiseL + dampening * (lastOutL - noiseL);
            lastOutR = noiseR + dampening * (lastOutR - noiseR);

            left[index] = lastOutL * envelope;
            right[index] = lastOutR * envelope;
        }

        return impulse;
    }

    private static rampParameter({
        filterNode,
        parameterName,
        targetValue = 20_000,
        durationMs,
        automation
    }: {
        filterNode: BiquadFilterNodeLike;
        parameterName: keyof BiquadFilterNodeLike;
        targetValue?: number;
        durationMs: number;
        automation: AutomationEngine;
    }): void {
        if (!filterNode || !filterNode[parameterName]) return;

        const parameter = filterNode[parameterName];
        // @ts-expect-error
        automation.ramp(parameter, targetValue, durationMs, 'linear');
    }
}
