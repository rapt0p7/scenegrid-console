import type AudioContextManager from '@webaudio-core/context/AudioContextManager';
import type {
    AudioNodeLike,
    BiquadFilterNodeLike,
    ConstantSourceNodeLike,
    DynamicsCompressorNodeLike,
    GainNodeLike,
    PannerNodeLike
} from '@webaudio-core/types/IAudioContext';
import clamp from '@webaudio-core/utils/clamp';

export interface PannerConfig {
    distanceModel?: DistanceModelType;
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
    panningModel?: PanningModelType;
}

export interface FilterConfig {
    type: BiquadFilterType;
    frequency: number;
    Q?: number;
    gain?: number;
}

export interface CompressorConfig {
    threshold?: number;
    knee?: number;
    ratio?: number;
    attack?: number;
    release?: number;
}

export class AudioNodeFactory {
    #contextManager: AudioContextManager;

    constructor(contextManager: AudioContextManager) {
        this.#contextManager = contextManager;
    }

    public createGain(gain: number = 1): GainNodeLike {
        const node = this.#contextManager.context.createGain();
        node.gain.value = clamp(gain, 0, 1);
        return node;
    }

    public createStereoPanner(pan: number = 0): AudioNodeLike {
        if (this.#contextManager.context.createStereoPanner) {
            const node = this.#contextManager.context.createStereoPanner();
            node.pan.value = clamp(pan, -1, 1);
            return node;
        }
        const fallback = this.#contextManager.context.createPanner();
        fallback.panningModel = 'equalpower';
        // @ts-expect-error
        fallback.setPosition(clamp(pan, -1, 1), 0, 1);
        return fallback;
    }

    public createFilter(config: FilterConfig): BiquadFilterNodeLike {
        const node = this.#contextManager.context.createBiquadFilter();
        node.type = config.type;
        const nyquist = this.#contextManager.context.sampleRate / 2;
        node.frequency.value = clamp(config.frequency, 0, nyquist);
        node.Q.value = clamp(config.Q ?? 1, 0.0001, 1000);
        node.gain.value = clamp(config.gain ?? 0, -40, 40);
        return node;
    }

    public createConstantSource(offset: number = 1): ConstantSourceNodeLike {
        const node = this.#contextManager.context.createConstantSource();
        node.start();
        node.offset.value = clamp(offset, -1, 1);
        return node;
    }

    public createCompressor(config: CompressorConfig = {}): DynamicsCompressorNodeLike {
        const node = this.#contextManager.context.createDynamicsCompressor();
        node.threshold.value = clamp(config.threshold ?? -24, -100, 0);
        node.knee.value = clamp(config.knee ?? 30, 0, 40);
        node.ratio.value = clamp(config.ratio ?? 12, 1, 20);
        node.attack.value = clamp(config.attack ?? 0.003, 0, 1);
        node.release.value = clamp(config.release ?? 0.25, 0, 1);

        return node;
    }

    public create3DPanner(config?: PannerConfig | boolean): PannerNodeLike {
        const panner = this.#contextManager.context.createPanner();

        panner.panningModel =
            typeof config === 'object' && 'panningModel' in config ? (config.panningModel ?? 'HRTF') : 'HRTF';

        if (typeof config === 'object') {
            panner.distanceModel = config.distanceModel || 'inverse';
            panner.refDistance = clamp(config.refDistance ?? 1, 0.1, 10_000);
            panner.maxDistance = clamp(config.maxDistance ?? 10_000, panner.refDistance, 100_000);
            panner.rolloffFactor = clamp(config.rolloffFactor ?? 1, 0, 10);
        } else {
            panner.distanceModel = 'inverse';
            panner.refDistance = 1;
            panner.maxDistance = 10_000;
            panner.rolloffFactor = 1;
        }

        if (panner.positionX) {
            panner.positionX.value = 0;
            panner.positionY.value = 0;
            panner.positionZ.value = 0;
        } else if ('setPosition' in panner) {
            (panner as any).setPosition(0, 0, 0);
        }

        return panner;
    }
}
