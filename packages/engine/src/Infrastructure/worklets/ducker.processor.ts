// noinspection D

import type { IAudioWorkletProcessor } from '../types/IAudioWorkletProcessor.js';

interface DuckerProcessorOptions {
    processorOptions?: {
        attack?: number;
        release?: number;
    };
}

class DuckerProcessor extends AudioWorkletProcessor implements IAudioWorkletProcessor {
    public static parameterDescriptors = [];
    private frameCounter: number = 0;
    private readonly attack: number;
    private readonly release: number;
    private activeEnvelope: number;
    private readonly attackCoeff: number;
    private readonly releaseCoeff: number;

    constructor(options: DuckerProcessorOptions) {
        super();
        this.attack = options.processorOptions?.attack ?? 0.03;
        this.release = options.processorOptions?.release ?? 0.25;
        this.activeEnvelope = 0;

        this.attackCoeff = Math.exp(-1 / (this.attack * sampleRate));
        this.releaseCoeff = Math.exp(-1 / (this.release * sampleRate));
    }

    // oxlint-disable-next-line max-lines-per-function
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
        const input = inputs[0];
        const output = outputs[0];

        const hasSignal = input && input.length > 0 && input[0].length > 0;

        if (hasSignal) {
            const inL = input[0];
            const inR = input[1] || inL;
            const outChannel = output[0];
            const length = inL.length;

            for (let i = 0; i < length; i++) {
                let l = inL[i];
                let r = inR[i];

                if (Math.abs(l) < 1e-7) l = 0;
                if (Math.abs(r) < 1e-7) r = 0;

                const sample = Math.max(Math.abs(l), Math.abs(r));

                this.activeEnvelope =
                    sample > this.activeEnvelope
                        ? this.attackCoeff * this.activeEnvelope + (1 - this.attackCoeff) * sample
                        : this.releaseCoeff * this.activeEnvelope + (1 - this.releaseCoeff) * sample;

                if (this.activeEnvelope < 1e-5) {
                    this.activeEnvelope = 0;
                }

                const clampedEnvironment = Math.max(0, Math.min(1, this.activeEnvelope));

                outChannel[i] = 1 - clampedEnvironment;
            }

            const outLen = output.length;
            for (let c = 1; c < outLen; c++) {
                output[c].set(outChannel);
            }
        } else {
            const outLen = output.length;
            for (let i = 0; i < outLen; i++) {
                const channel = output[i];
                if (channel) channel.fill(1);
            }
            this.activeEnvelope = 0;
        }

        this.frameCounter++;
        if (this.frameCounter >= 6) {
            // oxlint-disable-next-line unicorn/require-post-message-target-origin
            this.port.postMessage({ envelope: this.activeEnvelope });
            this.frameCounter = 0;
        }

        return true;
    }
}

try {
    registerProcessor('ducker-processor', DuckerProcessor);
} catch (error) {
    if ((error as any).name !== 'NotSupportedError') throw error;
    console.warn('ducker-processor already registered', error);
}
