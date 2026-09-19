import WorkletLoader from '@infrastructure/context/WorkletLoader';
import { Result, Ok, Err } from '@scene-grid/shared';
import { AudioWorkletNode } from 'standardized-audio-context';

import type { AudioCtx, AudioWorkletNodeLike, AudioNodeLike } from '../types/IAudioContext.js';
import type { ILimiterNode } from '../types/IAudioPlugins.js';

import { safeDisconnect } from '../utils/safeDisconnect.js';
// oxlint-disable-next-line import/default
import processorUrl from '../worklets/lookahead-brickwall-limiter.processor.js?worklet';

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
        return this.node;
    }

    public get outputNode(): AudioNodeLike {
        if (!this.node) throw new Error('[TinyLimiterNode] Node not loaded yet');
        return this.node;
    }

    public dispose(): void {
        if (this.node) {
            safeDisconnect(this.node);
            this.node = undefined;
        }
    }

    async load(): Promise<Result<AudioWorkletNodeLike, Error>> {
        try {
            await WorkletLoader.loadModule(this.ctx, processorUrl);

            this.node = new AudioWorkletNode!(this.ctx as any, 'lookahead-limiter', {
                processorOptions: this.opts,
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            }) as any;

            return Ok(this.node as AudioWorkletNodeLike);
        } catch (error) {
            return Err(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
