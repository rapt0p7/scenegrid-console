import type { IAudioWorkletProcessor } from '../interfaces/IAudioWorkletProcessor.js';

export interface TinyLimiterOptions {
    processorOptions?: {
        lookahead?: number;
        ceiling?: number;
        release?: number;
    };
}

class TinyLimiter extends AudioWorkletProcessor implements IAudioWorkletProcessor {
    private readonly lookahead: number;
    private readonly ceiling: number;
    private readonly releaseTime: number;
    private readonly delaySamples: number;
    private readonly bufferSize: number;
    private readonly delayL: Float32Array<ArrayBuffer>;
    private readonly delayR: Float32Array<ArrayBuffer>;
    private writePos: number;
    private envelope: number;
    private readonly releaseCoeff: number;
    static get parameterDescriptors(): never[] {
        return [];
    }

    constructor({ processorOptions }: TinyLimiterOptions) {
        super();

        this.lookahead = processorOptions?.lookahead || 0.005;
        this.ceiling = processorOptions?.ceiling || 0.99;
        this.releaseTime = processorOptions?.release || 0.1;

        this.delaySamples = Math.max(1, Math.floor(this.lookahead * sampleRate));
        this.bufferSize = sampleRate;

        this.delayL = new Float32Array(this.bufferSize);
        this.delayR = new Float32Array(this.bufferSize);

        this.writePos = 0;
        this.envelope = 0;

        this.releaseCoeff = Math.exp(-1 / (sampleRate * this.releaseTime));
    }

    process(
        inputs: Float32Array[][],
        outputs: Float32Array[][],
        parameters: { [name: string]: Float32Array }
    ): boolean {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || !input[0]) return true;

        const inL = input[0];
        const inR = input[1] || inL;

        const outL = output[0];
        const outR = output[1] || output[0];

        const N = inL.length;

        for (let index = 0; index < N; index++) {
            const l = inL[index];
            const r = inR[index];

            this.delayL[this.writePos] = l;
            this.delayR[this.writePos] = r;

            const peak = Math.max(Math.abs(l), Math.abs(r));

            this.envelope = peak > this.envelope ? peak : this.envelope * this.releaseCoeff;

            const gain = Math.min(1, this.ceiling / (this.envelope + 1e-9));

            const readPos = (this.writePos + this.bufferSize - this.delaySamples) % this.bufferSize;

            const dl = this.delayL[readPos] * gain;
            const dr = this.delayR[readPos] * gain;

            outL[index] = Math.max(-this.ceiling, Math.min(this.ceiling, dl));
            outR[index] = Math.max(-this.ceiling, Math.min(this.ceiling, dr));

            this.writePos = (this.writePos + 1) % this.bufferSize;
        }

        return true;
    }
}

registerProcessor('lookahead-limiter', TinyLimiter);
