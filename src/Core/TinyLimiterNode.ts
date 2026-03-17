import { AudioWorkletNode } from 'standardized-audio-context';

// @ts-ignore
import processorUrl from './lookahead-brickwall-limiter.processor.ts';

import type { ILimiterNode } from '../interfaces/IAudioPlugins';
import type { AudioCtx, AudioWorkletNodeLike, AudioNodeLike } from '@webaudio-core';

export default class TinyLimiterNode implements ILimiterNode {
    private readonly ctx: AudioCtx;
    private readonly opts: { lookahead: number; ceiling: number; release: number };
    private node: AudioWorkletNodeLike | undefined;
    constructor(context: AudioCtx, options: { lookahead?: number; ceiling?: number; release?: number } = {}) {
        this.ctx = context;
        this.opts = {
            lookahead: options.lookahead ?? 0.005, // 5ms
            ceiling: options.ceiling ?? 0.99,
            release: options.release ?? 0.1
        };
    }

    public get inputNode(): AudioNodeLike {
        if (!this.node) throw new Error('[TinyLimiterNode] Node not loaded yet');
        return this.node as unknown as AudioNodeLike;
    }

    public get outputNode(): AudioNodeLike {
        if (!this.node) throw new Error('[TinyLimiterNode] Node not loaded yet');
        return this.node as unknown as AudioNodeLike;
    }

    public dispose(): void {
        if (this.node) {
            try {
                this.node.disconnect();
            } catch {}
            this.node = undefined;
        }
    }

    async load(): Promise<AudioWorkletNodeLike> {
        await this.ctx.audioWorklet?.addModule?.(processorUrl);

        this.node = new AudioWorkletNode!(this.ctx, 'lookahead-limiter', {
            processorOptions: this.opts,
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });

        return this.node as AudioWorkletNodeLike;
    }
}
