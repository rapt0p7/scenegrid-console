import type AudioContextManager from '@infrastructure/context/AudioContextManager.js';
import type {
    AudioNodeLike,
    BiquadFilterNodeLike,
    ConstantSourceNodeLike,
    DynamicsCompressorNodeLike,
    GainNodeLike,
    PannerNodeLike
} from '@infrastructure/types/IAudioContext.js';
import type { IFilterConfig } from '@infrastructure/types/IFilter.js';
import { isDefined, isNumber, clamp } from '@scene-grid/shared';

export interface PannerConfig {
    distanceModel?: DistanceModelType;
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
    panningModel?: PanningModelType;
}

export interface CompressorConfig {
    threshold?: number;
    knee?: number;
    ratio?: number;
    attack?: number;
    release?: number;
}

export class AudioNodeFactory {
    readonly #contextManager: AudioContextManager;
    readonly #nyquist: number;

    constructor(contextManager: AudioContextManager) {
        this.#contextManager = contextManager;
        this.#nyquist = this.#contextManager.context.sampleRate / 2;
    }

    public createGain(gain: number = 1): GainNodeLike {
        const node = this.#contextManager.context.createGain();
        node.gain.value = clamp(gain, 0, 1);
        return node;
    }

    public createStereoPanner(pan: number = 0): AudioNodeLike {
        if (typeof this.#contextManager.context.createStereoPanner === 'function') {
            const node = this.#contextManager.context.createStereoPanner();
            node.pan.value = clamp(pan, -1, 1);
            return node;
        }

        const fallback = this.#contextManager.context.createPanner();
        fallback.panningModel = 'equalpower';

        if (isDefined(fallback.positionX)) {
            fallback.positionX.value = clamp(pan, -1, 1);
            fallback.positionY.value = 0;
            fallback.positionZ.value = 1;
        } else if (typeof (fallback as any).setPosition === 'function') {
            (fallback as any).setPosition(clamp(pan, -1, 1), 0, 1);
        }

        return fallback;
    }

    public createFilter(config: IFilterConfig): BiquadFilterNodeLike {
        const node = this.#contextManager.context.createBiquadFilter();
        this.mutateFilter(node, config);
        return node;
    }

    public mutateFilter(node: BiquadFilterNodeLike, config: IFilterConfig): void {
        node.type = config.type;

        if (isNumber(config.frequency)) {
            node.frequency.value = clamp(config.frequency, 0, this.#nyquist);
        }
        if (isNumber(config.Q)) {
            node.Q.value = clamp(config.Q, 0.0001, 1000);
        }
        if (isNumber(config.gain)) {
            node.gain.value = clamp(config.gain, -40, 40);
        }
    }

    public create3DPanner(config?: PannerConfig | boolean): PannerNodeLike {
        const panner = this.#contextManager.context.createPanner();
        this.mutate3DPanner(panner, config);

        if (isDefined(panner.positionX)) {
            panner.positionX.value = 0;
            panner.positionY.value = 0;
            panner.positionZ.value = 0;
        } else if (isDefined((panner as any).setPosition)) {
            (panner as any).setPosition(0, 0, 0);
        }

        return panner;
    }

    public mutate3DPanner(panner: PannerNodeLike, config?: PannerConfig | boolean): void {
        const hasConfig = typeof config === 'object' && isDefined(config);

        panner.panningModel = hasConfig && isDefined(config.panningModel) ? config.panningModel : 'HRTF';

        if (hasConfig) {
            panner.distanceModel = config.distanceModel ?? 'inverse';
            panner.refDistance = clamp(config.refDistance ?? 1, 0.1, 10_000);
            panner.maxDistance = clamp(config.maxDistance ?? 10_000, panner.refDistance, 100_000);
            panner.rolloffFactor = clamp(config.rolloffFactor ?? 1, 0, 10);
        } else {
            panner.distanceModel = 'inverse';
            panner.refDistance = 1;
            panner.maxDistance = 10_000;
            panner.rolloffFactor = 1;
        }
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
}
