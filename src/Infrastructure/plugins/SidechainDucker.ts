import { AudioWorkletNode } from 'standardized-audio-context';

import { safeDisconnect } from '@infrastructure/utils/safeDisconnect.js';
import { isDefined, isAbsent } from '@shared/guards.js';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import processorUrl from './ducker-processor.processor.js';

import type {
    AudioCtx,
    AudioNodeLike,
    AudioWorkletNodeLike,
    DelayNodeLike,
    GainNodeLike,
    WaveShaperNodeLike
} from '@infrastructure/types/IAudioContext';
import type { ISidechain } from '@infrastructure/types/IAudioPlugins.js';

export default class SidechainDucker implements ISidechain {
    public activeEnvelope: number = 0;
    private readonly ctx: AudioCtx;
    private readonly target: GainNodeLike;
    private readonly attack: number;
    private readonly release: number;
    private readonly lookahead: number;

    private readonly delay: DelayNodeLike;
    private readonly duckingGain: GainNodeLike;
    private readonly mergeGain: GainNodeLike;
    private readonly clipper: WaveShaperNodeLike;
    private nextNode: AudioNodeLike | null = null;

    private sources: Set<AudioNodeLike>;
    private sourceGainMap: Map<AudioNodeLike, GainNodeLike>;
    private intensityMap: Map<AudioNodeLike, number>;
    private running: boolean;

    private processor: AudioWorkletNodeLike | null = null;

    constructor({
        ctx,
        targetGainNode,
        attack = 0.015,
        release = 0.15,
        lookahead = 0.015
    }: {
        ctx: AudioCtx;
        targetGainNode: GainNodeLike;
        attack?: number;
        release?: number;
        lookahead?: number;
    }) {
        if (isAbsent(ctx) || isAbsent(targetGainNode)) {
            throw new Error('SidechainDucker requires ctx and targetGainNode');
        }

        this.ctx = ctx;
        this.target = targetGainNode;
        this.attack = attack;
        this.release = release;
        this.lookahead = lookahead;

        this.duckingGain = this.ctx.createGain();
        this.duckingGain.gain.value = 1;

        this.delay = this.ctx.createDelay(0.1);
        this.delay.delayTime.value = this.lookahead;

        this.mergeGain = this.ctx.createGain();
        this.mergeGain.gain.value = 1;

        this.clipper = this.ctx.createWaveShaper();
        this.clipper.curve = new Float32Array([-1, 1]);

        this.sources = new Set();
        this.sourceGainMap = new Map();
        this.intensityMap = new Map();

        this.running = false;
    }

    public insertLookahead(nextNode: AudioNodeLike): void {
        try {
            this.nextNode = nextNode;
            safeDisconnect(this.target, nextNode);
            this.target.connect(this.delay);
            this.delay.connect(this.duckingGain);
            this.duckingGain.connect(nextNode);
        } catch (error) {
            console.warn('[SidechainDucker] Failed to insert lookahead delay', error);
        }
    }

    public addSource(sourceNode: AudioNodeLike, intensity: number = 1): void {
        if (isAbsent(sourceNode) || typeof (sourceNode as any).connect !== 'function') return;

        if (this.sources.has(sourceNode)) {
            const g = this.sourceGainMap.get(sourceNode);
            if (isDefined(g)) g.gain.setTargetAtTime(intensity, this.ctx.currentTime, 0.01);
            this.intensityMap.set(sourceNode, intensity);
            return;
        }

        const g = this.ctx.createGain();
        g.gain.value = intensity;
        try {
            sourceNode.connect(g);
            g.connect(this.mergeGain);
        } catch (error) {
            console.warn('[SidechainDucker] Failed to connect source', error);
            safeDisconnect(g);
            return;
        }

        this.sources.add(sourceNode);
        this.sourceGainMap.set(sourceNode, g);
        this.intensityMap.set(sourceNode, intensity);
    }

    public removeSource(sourceNode: AudioNodeLike): void {
        if (isAbsent(sourceNode) || !this.sources.has(sourceNode)) return;

        const g = this.sourceGainMap.get(sourceNode);
        safeDisconnect(sourceNode, g);
        safeDisconnect(g, this.mergeGain);

        this.sources.delete(sourceNode);
        this.sourceGainMap.delete(sourceNode);
        this.intensityMap.delete(sourceNode);
    }

    public dispose(): void {
        this.stop();

        for (const [source, gain] of this.sourceGainMap.entries()) {
            safeDisconnect(source, gain);
            safeDisconnect(gain, this.mergeGain);
        }

        this.sources.clear();
        this.sourceGainMap.clear();
        this.intensityMap.clear();

        safeDisconnect(this.target, this.delay);
        safeDisconnect(this.duckingGain, this.nextNode);

        if (isDefined(this.nextNode)) {
            try {
                this.target.connect(this.nextNode);
            } catch (error) {
                console.warn('[SidechainDucker] Failed to restore graph connection during dispose', error);
            }
        }
        this.nextNode = null;

        safeDisconnect(this.duckingGain);
        safeDisconnect(this.delay);
        safeDisconnect(this.mergeGain);
        safeDisconnect(this.clipper);
    }

    public async start(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            if (isAbsent(this.processor)) {
                await this.ctx.audioWorklet?.addModule?.(processorUrl);

                this.processor = new AudioWorkletNode!(this.ctx as any, 'ducker-processor', {
                    processorOptions: { attack: this.attack, release: this.release }
                }) as unknown as AudioWorkletNodeLike;

                this.mergeGain.connect(this.clipper);
                this.clipper.connect(this.processor);

                this.duckingGain.gain.value = 0;
                this.processor.connect(this.duckingGain.gain as unknown as AudioNodeLike);

                // eslint-disable-next-line unicorn/prefer-add-event-listener
                this.processor.port.onmessage = (event: { data: { envelope: number | undefined } }) => {
                    if (isDefined(event.data.envelope)) {
                        this.activeEnvelope = event.data.envelope;
                    }
                };
            }
        } catch (error) {
            console.error('AudioWorklet initialization failed', error);
        }
    }

    public stop(): void {
        this.running = false;
        if (isDefined(this.processor)) {
            safeDisconnect(this.mergeGain, this.clipper);
            safeDisconnect(this.clipper, this.processor);
            safeDisconnect(this.processor, this.duckingGain.gain as unknown as AudioNodeLike);
            this.processor = null;
        }

        this.duckingGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05);
    }

    public removeAllSources(): void {
        for (const [source, gain] of this.sourceGainMap.entries()) {
            safeDisconnect(source, gain);
            safeDisconnect(gain, this.mergeGain);
        }

        this.sources.clear();
        this.sourceGainMap.clear();
        this.intensityMap.clear();
    }
}
