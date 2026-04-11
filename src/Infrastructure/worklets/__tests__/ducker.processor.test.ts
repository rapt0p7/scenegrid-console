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
            expect((processor as any).attack).toBe(0.03);
            expect((processor as any).release).toBe(0.25);
            expect((processor as any).activeEnvelope).toBe(0);
        });

        it('should initialize with provided processorOptions', () => {
            const processor = new capturedDuckerClass({
                processorOptions: { attack: 0.1, release: 0.5 }
            });
            expect((processor as any).attack).toBe(0.1);
            expect((processor as any).release).toBe(0.5);
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

            expect(warnSpy).toHaveBeenCalledWith('ducker-processor уже зарегистрирован');
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
});
