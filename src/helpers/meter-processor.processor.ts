// noinspection D

import type { IAudioWorkletProcessor } from '../interfaces/IAudioWorkletProcessor';

interface FilterCoeffs {
    b0: number;
    b1: number;
    b2: number;
    a1: number;
    a2: number;
}

interface HighpassFilter extends FilterCoeffs {
    z1_L: number;
    z2_L: number;
    z1_R: number;
    z2_R: number;
}

interface HighshelfFilter extends FilterCoeffs {
    z1_L: number;
    z2_L: number;
    z1_R: number;
    z2_R: number;
}

class MeterProcessorProcessor extends AudioWorkletProcessor implements IAudioWorkletProcessor {
    public static parameterDescriptors = [];
    private readonly sampleRate: number;
    private rms: number;
    private peak: number;
    private readonly hpFilter: HighpassFilter;
    private readonly hsFilter: HighshelfFilter;
    private readonly windowSize: number;
    private readonly energyBuffer: Float32Array<ArrayBuffer>;
    private energyIndex: number;
    private energySum: number;
    constructor() {
        super();

        this.sampleRate = sampleRate;

        this.rms = 0;
        this.peak = 0;

        this.hpFilter = this.createBiquad(this.highpassCoeffs());
        this.hsFilter = this.createBiquad(this.highshelfCoeffs());

        this.windowSize = Math.round(this.sampleRate * 0.4);
        this.energyBuffer = new Float32Array(this.windowSize);
        this.energyIndex = 0;
        this.energySum = 0;
    }

    createBiquad(c: FilterCoeffs): HighshelfFilter | HighpassFilter {
        return {
            b0: c.b0,
            b1: c.b1,
            b2: c.b2,
            a1: c.a1,
            a2: c.a2,
            z1_L: 0,
            z2_L: 0,
            z1_R: 0,
            z2_R: 0
        };
    }

    highpassCoeffs(): FilterCoeffs {
        return {
            b0: 0.978_03,
            b1: -1.956_06,
            b2: 0.978_03,
            a1: -1.955_58,
            a2: 0.956_543
        };
    }

    highshelfCoeffs(): FilterCoeffs {
        return {
            b0: 1.535_124,
            b1: -2.691_696,
            b2: 1.198_392,
            a1: -1.690_659,
            a2: 0.732_48
        };
    }

    runBiquad(f: HighpassFilter | HighshelfFilter, inL: number, inR: number) {
        // Left
        const outL = f.b0 * inL + f.z1_L;
        f.z1_L = f.b1 * inL + f.z2_L - f.a1 * outL;
        f.z2_L = f.b2 * inL - f.a2 * outL;

        // Right
        const outR = f.b0 * inR + f.z1_R;
        f.z1_R = f.b1 * inR + f.z2_R - f.a1 * outR;
        f.z2_R = f.b2 * inR - f.a2 * outR;

        return { outL, outR };
    }

    process(
        inputs: Float32Array[][],
        outputs: Float32Array[][],
        parameters: { [name: string]: Float32Array }
    ): boolean {
        const input = inputs[0];

        if (!input || input.length === 0 || input[0].length === 0) {
            this.energySum = 0;
            this.energyBuffer.fill(0);
            this.port.postMessage({ rms: 0, peak: 0, lufs: Number.NEGATIVE_INFINITY });
            return true;
        }

        const L = input[0];
        const R = input[1] || L;

        let sum = 0;
        let peak = 0;

        for (let [index, l] of L.entries()) {
            let r = R[index];

            if (Math.abs(l) < 1e-7) l = 0;
            if (Math.abs(r) < 1e-7) r = 0;

            sum += (l * l + r * r) * 0.5;
            if (Math.abs(l) > peak) peak = Math.abs(l);
            if (Math.abs(r) > peak) peak = Math.abs(r);

            const hp = this.runBiquad(this.hpFilter, l, r);
            const hs = this.runBiquad(this.hsFilter, hp.outL, hp.outR);

            const energy = (hs.outL * hs.outL + hs.outR * hs.outR) * 0.5;

            this.energySum -= this.energyBuffer[this.energyIndex];
            this.energyBuffer[this.energyIndex] = energy;
            this.energySum += energy;

            this.energyIndex++;

            if (this.energyIndex >= this.windowSize) {
                this.energyIndex = 0;
                let freshSum = 0;
                for (let index = 0; index < this.windowSize; index++) {
                    freshSum += this.energyBuffer[index];
                }
                this.energySum = freshSum;
            }
        }

        if (this.energySum < 1e-10) {
            this.energySum = 0;
        }

        this.rms = Math.sqrt(sum / L.length);
        this.peak = peak;

        const avgEnergy = this.energySum / this.windowSize;
        const lufs = avgEnergy > 1e-10 ? -0.691 + 10 * Math.log10(avgEnergy) : Number.NEGATIVE_INFINITY;

        this.port.postMessage({
            rms: this.rms,
            peak: this.peak,
            lufs
        });

        return true;
    }
}

try {
    registerProcessor('meter-processor', MeterProcessorProcessor);
} catch (error) {
    // @ts-expect-error
    if (error.name !== 'NotSupportedError') throw error;
    console.warn('meter-processor уже зарегистрирован');
}
