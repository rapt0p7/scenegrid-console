import { describe, it, expect, vi, beforeEach } from 'vitest';

class MockAudioWorkletProcessor {
    port = { postMessage: vi.fn() };
}

describe('TinyLimiter (lookahead-brickwall-limiter.processor)', () => {
    let capturedLimiterClass: any;

    beforeEach(async () => {
        capturedLimiterClass = undefined;

        vi.stubGlobal('AudioWorkletProcessor', MockAudioWorkletProcessor);
        vi.stubGlobal('sampleRate', 44_100);

        vi.stubGlobal('registerProcessor', (name: string, cls: any) => {
            if (name === 'lookahead-limiter') {
                capturedLimiterClass = cls;
            }
        });

        vi.resetModules();
        await import('../lookahead-brickwall-limiter.processor.js');
    });

    describe('Registration & Initialization', () => {
        it('should register the processor with correct name', () => {
            expect(capturedLimiterClass).toBeDefined();
            expect(capturedLimiterClass.parameterDescriptors).toEqual([]);
        });

        it('should initialize with default parameters', () => {
            const processor = new capturedLimiterClass({ processorOptions: {} });

            expect(processor.lookahead).toBe(0.005);
            expect(processor.ceiling).toBe(0.99);
            expect(processor.releaseTime).toBe(0.1);
            expect(processor.delaySamples).toBe(220);
            expect(processor.bufferSize).toBe(44_100);
        });

        it('should respect custom processorOptions', () => {
            const processor = new capturedLimiterClass({
                processorOptions: { lookahead: 0.01, ceiling: 0.8, release: 0.5 }
            });

            expect(processor.lookahead).toBe(0.01);
            expect(processor.ceiling).toBe(0.8);
            expect(processor.delaySamples).toBe(441);
        });

        it('should calculate the exact exponential release coefficient', () => {
            const sampleRate = 44_100;
            const releaseTime = 0.1;

            const processor = new capturedLimiterClass({
                processorOptions: { release: releaseTime }
            });

            const expectedCoeff = Math.exp(-1 / (sampleRate * releaseTime));
            expect(processor.releaseCoeff).toBeCloseTo(expectedCoeff, 6);
        });
    });

    describe('Signal Processing', () => {
        let processor: any;

        beforeEach(() => {
            processor = new capturedLimiterClass({
                processorOptions: { lookahead: 0.000_01, ceiling: 0.5, release: 0.1 }
            });
        });

        it('should return true immediately if inputs are empty or invalid', () => {
            expect(processor.process([], [], {})).toBe(true);
            expect(processor.process([[]], [], {})).toBe(true);
        });

        it('should delay the signal perfectly by delaySamples (1 sample in this test)', () => {
            const inputL = new Float32Array([0.2, 0.3, 0.4]);
            const inputs = [[inputL]];

            const outL = new Float32Array(3);
            const outputs = [[outL, new Float32Array(3)]];

            processor.process(inputs, outputs, {});

            expect(outL[0]).toBe(0);
            expect(outL[1]).toBeCloseTo(0.2, 5);
            expect(outL[2]).toBeCloseTo(0.3, 5);
            expect(outputs[0][1][1]).toBeCloseTo(0.2, 5);
        });

        it('should apply gain reduction and hard brickwall clamping when signal exceeds ceiling', () => {
            const inputL = new Float32Array([1, 2, -3]);
            const inputs = [[inputL]];

            const outL = new Float32Array(3);
            const outputs = [[outL, new Float32Array(3)]];

            processor.process(inputs, outputs, {});

            expect(outL[0]).toBe(0);
            expect(outL[1]).toBeLessThanOrEqual(0.5);
            expect(outL[1]).toBeGreaterThan(0);
            expect(outL[2]).toBeLessThanOrEqual(0.5);

            const nextOutL = new Float32Array(1);
            processor.process([[new Float32Array([0])]], [[nextOutL, new Float32Array(1)]], {});

            expect(nextOutL[0]).toBeGreaterThanOrEqual(-0.5);
            expect(nextOutL[0]).toBeLessThan(0);
        });

        it('should handle stereo inputs correctly (reading peak from both channels)', () => {
            const inputL = new Float32Array([0.1, 0.1, 0.1]);
            const inputR = new Float32Array([0.9, 0.9, 0.9]);
            const inputs = [[inputL, inputR]];

            const outL = new Float32Array(3);
            const outR = new Float32Array(3);
            const outputs = [[outL, outR]];

            processor.process(inputs, outputs, {});

            expect(outL[0]).toBe(0);
            expect(outR[0]).toBe(0);

            expect(outL[1]).toBeLessThan(0.1);
            expect(outL[1]).toBeGreaterThan(0);

            expect(outR[1]).toBeCloseTo(0.5, 2);
        });

        it('should recover gain over the configured release time after an initial peak', () => {
            const releaseTimeSec = 0.01;
            const releaseSamples = Math.round(44_100 * releaseTimeSec);
            // oxlint-disable-next-line no-shadow
            const processor = new capturedLimiterClass({
                processorOptions: { lookahead: 1 / 44_100, ceiling: 0.5, release: releaseTimeSec }
            });

            processor.process([[new Float32Array([1.0])]], [[new Float32Array(1)]], {});
            processor.process([[new Float32Array(releaseSamples)]], [[new Float32Array(releaseSamples)]], {});
            const probeIn = new Float32Array([0.2, 0.2]);
            const probeOut = new Float32Array(2);
            processor.process([[probeIn]], [[probeOut]], {});

            expect(probeOut[1]).toBeCloseTo(0.2, 3);
        });
    });

    it('should decay the envelope when consecutive peaks have equal amplitude', () => {
        const processor = new capturedLimiterClass({
            processorOptions: { lookahead: 2 / 44_100, ceiling: 0.8, release: 0.0001 }
        });
        const inputL = new Float32Array([0.2, 1.0, 1.0]);
        const outL = new Float32Array(3);

        processor.process([[inputL]], [[outL]], {});

        expect(outL[2]).toBeCloseTo(0.2, 2);
    });

    it('should decrease the envelope over time during release rather than amplifying it', () => {
        const processor = new capturedLimiterClass({
            processorOptions: { lookahead: 1 / 44_100, ceiling: 0.9, release: 0.001 }
        });
        const inputL = new Float32Array(50);
        inputL[0] = 1.0;
        inputL[40] = 0.3;
        inputL[41] = 0.3;
        const outL = new Float32Array(50);

        processor.process([[inputL]], [[outL]], {});

        expect(outL[41]).toBeCloseTo(0.3, 2);
    });

    it('should maintain gain reduction across lookahead delay when followed by quiet input', () => {
        const processor = new capturedLimiterClass({
            processorOptions: { lookahead: 2 / 44_100, ceiling: 0.5, release: 0.1 }
        });
        const inputL = new Float32Array([0.4, 0.4, 2.0, 0.0]);
        const outL = new Float32Array(4);

        processor.process([[inputL]], [[outL]], {});

        expect(outL[3]).toBeCloseTo(0.1, 2);
    });

    it('should maintain positive unity gain and avoid phase inversion when envelope decays near zero', () => {
        const processor = new capturedLimiterClass({
            processorOptions: { lookahead: 50 / 44_100, ceiling: 0.99, release: 0.0001 }
        });
        const inputL = new Float32Array(60);
        inputL[0] = 0.01;
        const outL = new Float32Array(60);

        processor.process([[inputL]], [[outL]], {});

        expect(outL[50]).toBeCloseTo(0.01, 4);
    });

    it('should attenuate the right channel by multiplying by gain when left channel triggers limiting', () => {
        const processor = new capturedLimiterClass({
            processorOptions: { lookahead: 1 / 44_100, ceiling: 0.4, release: 0.1 }
        });
        const inputL = new Float32Array([0.8, 0.8]);
        const inputR = new Float32Array([0.1, 0.1]);
        const outL = new Float32Array(2);
        const outR = new Float32Array(2);

        processor.process([[inputL, inputR]], [[outL, outR]], {});

        expect(outR[1]).toBeCloseTo(0.05, 4);
    });

    it('should return true after processing valid audio frames to keep the AudioWorklet active', () => {
        const processor = new capturedLimiterClass({ processorOptions: {} });
        const input = [[new Float32Array([0.1, 0.2])]];
        const output = [[new Float32Array(2)]];

        const result = processor.process(input, output, {});

        expect(result).toBe(true);
    });
});
