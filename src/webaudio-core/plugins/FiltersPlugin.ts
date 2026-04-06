// noinspection D

import type AutomationEngine from '@webaudio-core/automation/AutomationEngine.js';
import type {
    AudioBufferLike,
    AudioCtx,
    AudioParameterKeys,
    BiquadFilterNodeLike,
    ConvolverNodeNodeLike
} from '@webaudio-core/types/IAudioContext.js';
import type { IFilterConfig, IReverbFilterConfig } from '@webaudio-core/types/IFilter.js';
import { isDefined, isAbsent } from '@webaudio-core/utils/guards.js';

export default class FiltersPlugin {
    private static impulseCache: Map<string, AudioBufferLike> = new Map();

    public static createNode(
        context: AudioCtx,
        automation: AutomationEngine,
        config: IFilterConfig | IReverbFilterConfig
    ): BiquadFilterNodeLike | ConvolverNodeNodeLike | null {
        if (isAbsent(config.type) || (config.type as string) === '') return null;

        if (config.type === 'reverb') {
            return this.createReverb(context, config as unknown as IReverbFilterConfig);
        }

        const filter = context.createBiquadFilter();

        try {
            filter.type = (config.type as BiquadFilterType) || 'allpass';
        } catch {
            /* empty */
        }

        if (isDefined(config.frequency)) {
            automation.set(filter.frequency, config.frequency);
        }

        if (isDefined(config.Q)) {
            automation.set(filter.Q, config.Q);
        }

        return filter;
    }

    private static createReverb(context: AudioCtx, config: IReverbFilterConfig): ConvolverNodeNodeLike {
        const convolver = context.createConvolver();

        const time = config.reverbTime ?? 2;
        const decay = config.reverbDecay ?? 2;

        const cacheKey = `${time}_${decay}_${context.sampleRate}`;
        const cachedImpulse = this.impulseCache.get(cacheKey);

        if (isDefined(cachedImpulse)) {
            convolver.buffer = cachedImpulse;
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
        parameterName: AudioParameterKeys<BiquadFilterNodeLike>;
        targetValue?: number;
        durationMs: number;
        automation: AutomationEngine;
    }): void {
        if (isAbsent(filterNode)) return;

        // eslint-disable-next-line security/detect-object-injection
        const parameter = filterNode[parameterName];

        if (isAbsent(parameter)) return;

        automation.ramp(parameter, targetValue, durationMs, 'linear');
    }
}
