import type { AudioNodeFactory, PannerConfig } from '@infrastructure/nodes/AudioNodeFactory.js';
import {
    AudioNodeLike,
    AudioParamLike,
    BiquadFilterNodeLike,
    GainNodeLike,
    PannerNodeLike,
    StereoPannerNodeLike
} from '@infrastructure/types/IAudioContext.js';
import type { IFilterConfig } from '@infrastructure/types/IFilter.js';
import type { INodeChain } from '@infrastructure/types/INodeChain.js';

export interface INodeChainOptions {
    hasPanner?: boolean;
    spatial?: PannerConfig | boolean;
    initialFilters?: IFilterConfig[];
}

export class NodeChain implements INodeChain {
    readonly #inputNode: GainNodeLike;
    readonly #outputNode: GainNodeLike;
    readonly #factory: AudioNodeFactory;
    #panner: AudioNodeLike | null = null;
    readonly #filterPool: BiquadFilterNodeLike[] = [];
    #activeFilterCount: number = 0;

    #externalDestination: AudioNodeLike | null = null;

    constructor(factory: AudioNodeFactory, options: INodeChainOptions = {}) {
        this.#factory = factory;

        this.#inputNode = this.#factory.createGain(1);
        this.#outputNode = this.#factory.createGain(1);

        if (options.spatial) {
            this.#panner = this.#factory.create3DPanner(options.spatial);
        } else if (options.hasPanner) {
            this.#panner = this.#factory.createStereoPanner(0);
        }

        if (options.initialFilters) {
            this.setFilters(options.initialFilters);
        } else {
            this.#rebuildInternalGraph();
        }
    }

    public get gainParam(): AudioParamLike {
        return this.#inputNode.gain;
    }

    public get sidechainTriggerNode(): AudioNodeLike {
        return this.#inputNode;
    }

    public get pannerNode(): StereoPannerNodeLike | PannerNodeLike | null {
        return this.#panner as StereoPannerNodeLike | PannerNodeLike | null;
    }

    public get mainFilterNode(): BiquadFilterNodeLike | null {
        return this.#activeFilterCount > 0 ? this.#filterPool[0] : null;
    }

    public setFilters(configs: IFilterConfig[]): void {
        while (this.#filterPool.length < configs.length) {
            this.#filterPool.push(this.#factory.createFilter({ type: 'lowpass', frequency: 22000 }));
        }

        for (let i = 0; i < configs.length; i++) {
            const cfg = configs[i];
            const filter = this.#filterPool[i];

            filter.type = cfg.type;
            if (cfg.frequency !== undefined) filter.frequency.value = cfg.frequency;
            if (cfg.Q !== undefined) filter.Q.value = cfg.Q;
        }

        this.#activeFilterCount = configs.length;
        this.#rebuildInternalGraph();
    }

    public connectTo(destination: AudioNodeLike): void {
        if (this.#externalDestination) {
            this.#outputNode.disconnect(this.#externalDestination);
        }

        this.#externalDestination = destination;
        this.#outputNode.connect(destination);
    }

    public disconnect(): void {
        if (this.#externalDestination) {
            this.#outputNode.disconnect(this.#externalDestination);
            this.#externalDestination = null;
        }
    }

    public dispose(): void {
        this.disconnect();
        this.#inputNode.disconnect();
        for (const f of this.#filterPool) f.disconnect();
        if (this.#panner) this.#panner.disconnect();
        this.#outputNode.disconnect();
    }

    public setPannerMode(options: { hasPanner?: boolean; spatial?: PannerConfig | boolean }): void {
        if (this.#panner) {
            this.#panner.disconnect();
        }

        if (options.spatial) {
            const spatialConfig = typeof options.spatial === 'object' ? options.spatial : {};
            this.#panner = this.#factory.create3DPanner(spatialConfig);
        } else if (options.hasPanner) {
            this.#panner = this.#factory.createStereoPanner(0);
        } else {
            this.#panner = null;
        }

        this.#rebuildInternalGraph();
    }

    public connectSource(source: AudioNodeLike): void {
        source.connect(this.#inputNode);
    }

    #rebuildInternalGraph(): void {
        this.#inputNode.disconnect();
        for (let i = 0; i < this.#activeFilterCount; i++) {
            this.#filterPool[i].disconnect();
        }
        if (this.#panner) this.#panner.disconnect();

        let lastNode: AudioNodeLike = this.#inputNode;

        for (let i = 0; i < this.#activeFilterCount; i++) {
            const filter = this.#filterPool[i];
            lastNode.connect(filter);
            lastNode = filter;
        }

        if (this.#panner) {
            lastNode.connect(this.#panner);
            lastNode = this.#panner;
        }

        lastNode.connect(this.#outputNode);
    }
}
