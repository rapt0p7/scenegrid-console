import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPostMessage = vi.fn();
class MockAudioWorkletProcessor {
    port = { postMessage: mockPostMessage };
}

describe('DuckerProcessor', () => {
    let capturedDuckerClass: any;

    beforeEach(async () => {
        mockPostMessage.mockClear();
        capturedDuckerClass = undefined;

        vi.stubGlobal('AudioWorkletProcessor', MockAudioWorkletProcessor);
        vi.stubGlobal('sampleRate', 44_100);

        vi.stubGlobal('registerProcessor', (name: string, cls: any) => {
            if (name === 'ducker-processor') {
                capturedDuckerClass = cls;
            }
        });

        vi.resetModules();
        await import('../ducker.processor.js');
    });

    describe('Initialization', () => {
        it('should initialize with default options', () => {
            const processor = new capturedDuckerClass({});
            expect(processor.attack).toBe(0.03);
            expect(processor.release).toBe(0.25);
            expect(processor.activeEnvelope).toBe(0);
        });

        it('should initialize with provided processorOptions', () => {
            const processor = new capturedDuckerClass({
                processorOptions: { attack: 0.1, release: 0.5 }
            });
            expect(processor.attack).toBe(0.1);
            expect(processor.release).toBe(0.5);
        });
    });

    describe('Processing (process method)', () => {
        let processor: any;

        beforeEach(() => {
            processor = new capturedDuckerClass({});
        });

        it('should handle missing signal (empty inputs) by filling outputs with 1 and resetting envelope', () => {
            const inputs: any[] = [[]]; // hasSignal = false
            const outL = new Float32Array(10);
            const outR = new Float32Array(10);
            const outputs = [[outL, outR]];

            processor.activeEnvelope = 0.5;

            const result = processor.process(inputs, outputs, {});

            expect(result).toBe(true);
            expect(outL[0]).toBe(1);
            expect(outR[0]).toBe(1);
            expect(processor.activeEnvelope).toBe(0);
        });

        it('should process mono signal (Attack phase) and mirror it to stereo outputs', () => {
            const inputs = [[new Float32Array(5).fill(1)]];
            const outL = new Float32Array(5);
            const outR = new Float32Array(5);
            const outputs = [[outL, outR]];

            processor.process(inputs, outputs, {});

            expect(processor.activeEnvelope).toBeGreaterThan(0);

            expect(outL[4]).toBeLessThan(1);

            expect(outR).toEqual(outL);
        });

        it('should process stereo signal (Release phase)', () => {
            processor.activeEnvelope = 1;

            const inputs = [[new Float32Array(5).fill(0.1), new Float32Array(5).fill(0.2)]];
            const outputs = [[new Float32Array(5)]];

            processor.process(inputs, outputs, {});

            expect(processor.activeEnvelope).toBeLessThan(1);
            expect(processor.activeEnvelope).toBeGreaterThan(0.2);
        });

        it('should filter denormal noise (< 1e-7) to 0', () => {
            const inputs = [[new Float32Array([1e-8])]];
            const outputs = [[new Float32Array(1)]];

            processor.process(inputs, outputs, {});

            expect(processor.activeEnvelope).toBe(0);
            expect(outputs[0][0][0]).toBe(1);
        });

        it('should snap envelope to 0 if it drops below 1e-5', () => {
            processor.activeEnvelope = 1e-6;
            const inputs = [[new Float32Array([0])]];
            const outputs = [[new Float32Array(1)]];

            processor.process(inputs, outputs, {});

            expect(processor.activeEnvelope).toBe(0);
        });

        it('should post message to port every 6 frames', () => {
            const inputs = [[new Float32Array(1).fill(0)]];
            const outputs = [[new Float32Array(1)]];

            for (let index = 0; index < 5; index++) {
                processor.process(inputs, outputs, {});
            }
            expect(mockPostMessage).not.toHaveBeenCalled();

            processor.process(inputs, outputs, {});

            expect(mockPostMessage).toHaveBeenCalledTimes(1);
            expect(mockPostMessage).toHaveBeenCalledWith({ envelope: expect.any(Number) });

            processor.process(inputs, outputs, {});
            expect(mockPostMessage).toHaveBeenCalledTimes(1);
        });
    });

    describe('Registration Errors (try/catch block)', () => {
        it('should catch NotSupportedError silently and log a warning', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            vi.stubGlobal('registerProcessor', () => {
                const error = new Error('Already registered');
                error.name = 'NotSupportedError';
                throw error;
            });

            vi.resetModules();
            await import('../ducker.processor.js');

            expect(warnSpy).toHaveBeenCalledWith('ducker-processor already registered', expect.any(Error));
            warnSpy.mockRestore();
        });

        it('should re-throw fatal errors other than NotSupportedError', async () => {
            vi.stubGlobal('registerProcessor', () => {
                throw new Error('Fatal System Error');
            });

            vi.resetModules();
            await expect(import('../ducker.processor.js')).rejects.toThrow('Fatal System Error');
        });
    });

    it('should expose an empty parameterDescriptors static array', () => {
        const descriptors = capturedDuckerClass.parameterDescriptors;

        expect(descriptors).toEqual([]);
    });

    it('should calculate exact attack coefficient and step response', () => {
        const sampleRate = 44_100;
        const attackTime = 0.03;
        const expectedCoeff = Math.exp(-1 / (attackTime * sampleRate));
        const processor = new capturedDuckerClass({
            processorOptions: { attack: attackTime, release: 0.25 }
        });
        const sampleValue = 0.5;
        const inputs = [[new Float32Array([sampleValue])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        const expectedEnvelope = (1 - expectedCoeff) * sampleValue;
        expect(processor.activeEnvelope).toBeCloseTo(expectedEnvelope, 7);
        expect(outputs[0][0][0]).toBeCloseTo(1 - expectedEnvelope, 7);
    });

    it('should calculate exact release coefficient and step response', () => {
        const sampleRate = 44_100;
        const releaseTime = 0.25;
        const expectedCoeff = Math.exp(-1 / (releaseTime * sampleRate));
        const processor = new capturedDuckerClass({
            processorOptions: { attack: 0.03, release: releaseTime }
        });
        processor.activeEnvelope = 0.8;
        const sampleValue = 0.2;
        const inputs = [[new Float32Array([sampleValue])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        const expectedEnvelope = expectedCoeff * 0.8 + (1 - expectedCoeff) * sampleValue;
        expect(processor.activeEnvelope).toBeCloseTo(expectedEnvelope, 7);
        expect(outputs[0][0][0]).toBeCloseTo(1 - expectedEnvelope, 7);
    });

    it('should treat zero-length input channels as no signal and reset envelope', () => {
        const processor = new capturedDuckerClass({});
        processor.activeEnvelope = 0.75;
        const inputs = [[new Float32Array(0)]];
        const outL = new Float32Array(4).fill(0);
        const outputs = [[outL]];

        const result = processor.process(inputs, outputs, {});

        expect(result).toBe(true);
        expect(outL[0]).toBe(1);
        expect(processor.activeEnvelope).toBe(0);
    });

    it('should safely handle completely empty inputs array without crashing', () => {
        const processor = new capturedDuckerClass({});
        processor.activeEnvelope = 0.5;
        const outL = new Float32Array(4).fill(0);
        const outputs = [[outL]];

        const result = processor.process([], outputs, {});

        expect(result).toBe(true);
        expect(outL[0]).toBe(1);
        expect(processor.activeEnvelope).toBe(0);
    });

    it('should zero left channel denormals (< 1e-7) during active envelope release', () => {
        const processor = new capturedDuckerClass({});
        processor.activeEnvelope = 0.5;
        const expectedCoeff = Math.exp(-1 / (0.25 * 44_100));
        const inputs = [[new Float32Array([5e-8]), new Float32Array([0])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        const expectedEnvelope = expectedCoeff * 0.5;
        expect(processor.activeEnvelope).toBeCloseTo(expectedEnvelope, 8);
    });

    it('should zero right channel denormals (< 1e-7) during active envelope release', () => {
        const processor = new capturedDuckerClass({});
        processor.activeEnvelope = 0.5;
        const expectedCoeff = Math.exp(-1 / (0.25 * 44_100));
        const inputs = [[new Float32Array([0]), new Float32Array([5e-8])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        const expectedEnvelope = expectedCoeff * 0.5;
        expect(processor.activeEnvelope).toBeCloseTo(expectedEnvelope, 8);
    });

    it('should not zero signals at or above the 1e-7 denormal threshold', () => {
        const processor = new capturedDuckerClass({});
        processor.activeEnvelope = 0.5;
        const expectedCoeff = Math.exp(-1 / (0.25 * 44_100));
        const inputs = [[new Float32Array([1e-7]), new Float32Array([0])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        const expectedEnvelope = expectedCoeff * 0.5 + (1 - expectedCoeff) * 1e-7;
        expect(processor.activeEnvelope).toBeCloseTo(expectedEnvelope, 8);
    });

    it('should preserve regular signals on right channel when left channel is silent', () => {
        const processor = new capturedDuckerClass({});
        const attackCoeff = Math.exp(-1 / (0.03 * 44_100));
        const inputs = [[new Float32Array([0]), new Float32Array([0.6])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        const expectedEnvelope = (1 - attackCoeff) * 0.6;
        expect(processor.activeEnvelope).toBeCloseTo(expectedEnvelope, 7);
    });

    it('should track the maximum absolute peak between left and right channels', () => {
        const processor = new capturedDuckerClass({});
        const attackCoeff = Math.exp(-1 / (0.03 * 44_100));
        const inputs = [[new Float32Array([0.8]), new Float32Array([0.2])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        const expectedEnvelope = (1 - attackCoeff) * 0.8;
        expect(processor.activeEnvelope).toBeCloseTo(expectedEnvelope, 7);
    });

    it('should select attack branch when sample exceeds active envelope', () => {
        const processor = new capturedDuckerClass({});
        processor.activeEnvelope = 0.2;
        const attackCoeff = Math.exp(-1 / (0.03 * 44_100));
        const sample = 0.6;
        const inputs = [[new Float32Array([sample])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        const expectedEnvelope = attackCoeff * 0.2 + (1 - attackCoeff) * sample;
        expect(processor.activeEnvelope).toBeCloseTo(expectedEnvelope, 7);
    });

    it('should select release branch when sample is below active envelope', () => {
        const processor = new capturedDuckerClass({});
        processor.activeEnvelope = 0.6;
        const releaseCoeff = Math.exp(-1 / (0.25 * 44_100));
        const sample = 0.2;
        const inputs = [[new Float32Array([sample])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        const expectedEnvelope = releaseCoeff * 0.6 + (1 - releaseCoeff) * sample;
        expect(processor.activeEnvelope).toBeCloseTo(expectedEnvelope, 7);
    });

    it('should perform correct linear interpolation during attack with non-unit sample and non-zero envelope', () => {
        const processor = new capturedDuckerClass({});
        processor.activeEnvelope = 0.2;
        const attackCoeff = Math.exp(-1 / (0.03 * 44_100));
        const sample = 0.5;
        const inputs = [[new Float32Array([sample])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        const expectedEnvelope = attackCoeff * 0.2 + (1 - attackCoeff) * sample;
        expect(processor.activeEnvelope).toBeCloseTo(expectedEnvelope, 7);
    });

    it('should perform correct additive interpolation during release with non-zero sample', () => {
        const processor = new capturedDuckerClass({});
        processor.activeEnvelope = 0.8;
        const releaseCoeff = Math.exp(-1 / (0.25 * 44_100));
        const sample = 0.4;
        const inputs = [[new Float32Array([sample])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        const expectedEnvelope = releaseCoeff * 0.8 + (1 - releaseCoeff) * sample;
        expect(processor.activeEnvelope).toBeCloseTo(expectedEnvelope, 7);
    });

    it('should not snap activeEnvelope to 0 when it is exactly 1e-5', () => {
        const processor = new capturedDuckerClass({});
        const sampleRate = 44_100;
        const releaseCoeff = Math.exp(-1 / (0.25 * sampleRate));

        processor.activeEnvelope = 1e-5 / releaseCoeff;

        const inputs = [[new Float32Array([0])]];
        const outputs = [[new Float32Array(1)]];

        processor.process(inputs, outputs, {});

        expect(processor.activeEnvelope).toBe(1e-5);
        expect(outputs[0][0][0]).toBeCloseTo(1 - 1e-5, 7);
    });

    it('should safely fill only defined channels when output contains undefined slots during fallback', () => {
        const processor = new capturedDuckerClass({});
        const outL = new Float32Array(4).fill(0);
        const outputs = [[outL, undefined as unknown as Float32Array]];

        expect(() => {
            processor.process([], outputs, {});
        }).not.toThrow();

        expect(outL[0]).toBe(1);
        expect(processor.activeEnvelope).toBe(0);
    });
});
