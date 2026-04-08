import type { AudioNodeFactory, PannerConfig } from '@infrastructure/nodes/AudioNodeFactory.js';
import type {
    AudioNodeLike,
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
    public readonly inputNode: GainNodeLike;
    public readonly outputNode: GainNodeLike;
    public readonly instanceGain: GainNodeLike;

    readonly #factory: AudioNodeFactory;
    readonly #panner: AudioNodeLike | null = null;
    #filters: BiquadFilterNodeLike[] = [];
    #externalDestination: AudioNodeLike | null = null;

    constructor(factory: AudioNodeFactory, options: INodeChainOptions = {}) {
        this.#factory = factory;

        this.inputNode = this.#factory.createGain(1);
        this.instanceGain = this.inputNode;

        this.outputNode = this.#factory.createGain(1);

        if (options.spatial) {
            this.#panner = this.#factory.create3DPanner(options.spatial);
        } else if (options.hasPanner) {
            this.#panner = this.#factory.createStereoPanner(0);
        }

        if (options.initialFilters) {
            this.#filters = options.initialFilters.map(cfg => this.#factory.createFilter(cfg));
        }

        this.#rebuildInternalGraph();
    }

    public get pannerNode(): StereoPannerNodeLike | PannerNodeLike | null {
        return this.#panner as StereoPannerNodeLike | PannerNodeLike | null;
    }

    public get mainFilterNode(): BiquadFilterNodeLike | null {
        return this.#filters.length > 0 ? this.#filters[0] : null;
    }

    public setFilters(configs: IFilterConfig[]): void {
        for (const f of this.#filters) f.disconnect();
        this.#filters = configs.map(cfg => this.#factory.createFilter(cfg));
        this.#rebuildInternalGraph();
    }

    public connectTo(destination: AudioNodeLike): void {
        if (this.#externalDestination) {
            this.outputNode.disconnect(this.#externalDestination);
        }

        this.#externalDestination = destination;
        this.outputNode.connect(destination);
    }

    public disconnect(): void {
        if (this.#externalDestination) {
            this.outputNode.disconnect(this.#externalDestination);
            this.#externalDestination = null;
        }
    }

    public dispose(): void {
        this.disconnect();
        this.inputNode.disconnect();
        for (const f of this.#filters) f.disconnect();
        if (this.#panner) this.#panner.disconnect();
        this.outputNode.disconnect();
    }

    #rebuildInternalGraph(): void {
        this.inputNode.disconnect();
        for (const f of this.#filters) f.disconnect();
        if (this.#panner) this.#panner.disconnect();

        let lastNode: AudioNodeLike = this.inputNode;

        for (const filter of this.#filters) {
            lastNode.connect(filter);
            lastNode = filter;
        }

        if (this.#panner) {
            lastNode.connect(this.#panner);
            lastNode = this.#panner;
        }

        lastNode.connect(this.outputNode);
    }
}
