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
        await import('../lookahead-brickwall-limiter.processor');
    });

    describe('Registration & Initialization', () => {
        it('should register the processor with correct name', () => {
            expect(capturedLimiterClass).toBeDefined();
            expect(capturedLimiterClass.parameterDescriptors).toEqual([]);
        });

        it('should initialize with default parameters', () => {
            const processor = new capturedLimiterClass({ processorOptions: {} });

            expect((processor as any).lookahead).toBe(0.005);
            expect((processor as any).ceiling).toBe(0.99);
            expect((processor as any).releaseTime).toBe(0.1);
            expect((processor as any).delaySamples).toBe(220);
            expect((processor as any).bufferSize).toBe(44_100);
        });

        it('should respect custom processorOptions', () => {
            const processor = new capturedLimiterClass({
                processorOptions: { lookahead: 0.01, ceiling: 0.8, release: 0.5 }
            });

            expect((processor as any).lookahead).toBe(0.01);
            expect((processor as any).ceiling).toBe(0.8);
            expect((processor as any).delaySamples).toBe(441);
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
    });
});
