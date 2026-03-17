import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPostMessage = vi.fn();
class MockAudioWorkletProcessor {
    port = { postMessage: mockPostMessage };
}

describe('MeterProcessorProcessor', () => {
    let capturedMeterClass: any;

    beforeEach(async () => {
        mockPostMessage.mockClear();
        capturedMeterClass = undefined;

        vi.stubGlobal('AudioWorkletProcessor', MockAudioWorkletProcessor);

        vi.stubGlobal('sampleRate', 10);

        vi.stubGlobal('registerProcessor', (name: string, cls: any) => {
            if (name === 'meter-processor') {
                capturedMeterClass = cls;
            }
        });

        vi.resetModules();
        await import('../meter-processor.processor');
    });

    describe('Registration & Initialization', () => {
        it('should register the processor successfully', () => {
            expect(capturedMeterClass).toBeDefined();
            expect(capturedMeterClass.parameterDescriptors).toEqual([]);
        });

        it('should initialize properties and calculate correct window size', () => {
            const processor = new capturedMeterClass();

            expect((processor as any).windowSize).toBe(4);
            expect((processor as any).energyBuffer.length).toBe(4);
            expect((processor as any).rms).toBe(0);
            expect((processor as any).peak).toBe(0);
        });

        it('should initialize K-weighting filters with correct hardcoded coefficients', () => {
            const processor = new capturedMeterClass();

            const hp = (processor as any).hpFilter;
            expect(hp.b0).toBeCloseTo(0.978_03);
            expect(hp.a1).toBeCloseTo(-1.955_58);

            const hs = (processor as any).hsFilter;
            expect(hs.b0).toBeCloseTo(1.535_124);
        });
    });

    describe('Signal Processing (process method)', () => {
        let processor: any;

        beforeEach(() => {
            processor = new capturedMeterClass();
        });

        it('should handle empty or invalid inputs and return silence', () => {
            processor.process([], [], {});
            expect(mockPostMessage).toHaveBeenLastCalledWith({ rms: 0, peak: 0, lufs: Number.NEGATIVE_INFINITY });

            processor.process([[]], [], {});
            expect(mockPostMessage).toHaveBeenLastCalledWith({ rms: 0, peak: 0, lufs: Number.NEGATIVE_INFINITY });
        });

        it('should snap denormal numbers to 0 and clamp ultra-low energy', () => {
            const inputL = new Float32Array([1e-8]);
            processor.process([[inputL]], [], {});

            expect(mockPostMessage).toHaveBeenCalledWith({
                rms: 0,
                peak: 0,
                lufs: Number.NEGATIVE_INFINITY
            });
            expect(processor.energySum).toBe(0);
        });

        it('should process mono signal correctly and compute RMS/Peak', () => {
            const inputL = new Float32Array([1, 1]);
            processor.process([[inputL]], [], {});

            expect(mockPostMessage).toHaveBeenCalledTimes(1);

            const message = mockPostMessage.mock.calls[0][0];
            expect(message.peak).toBe(1);
            expect(message.rms).toBeCloseTo(1);
            expect(message.lufs).not.toBe(Number.NEGATIVE_INFINITY);
            expect(message.lufs).toBeLessThan(0);
        });

        it('should process stereo signal correctly (peak across both channels)', () => {
            const inputL = new Float32Array([0.2, 0.2]);
            const inputR = new Float32Array([-0.8, -0.8]);
            processor.process([[inputL, inputR]], [], {});

            const message = mockPostMessage.mock.calls[0][0];

            expect(message.peak).toBeCloseTo(0.8, 5);
            expect(message.rms).toBeGreaterThan(0);
        });

        it('should wrap around the energy buffer and recalculate sum correctly', () => {
            const inputL = new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5]);

            processor.process([[inputL]], [], {});

            expect(processor.energyIndex).toBe(1);

            expect(processor.energySum).toBeGreaterThan(0);
        });
    });

    describe('Registration Errors', () => {
        it('should catch NotSupportedError silently and log a warning', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            vi.stubGlobal('registerProcessor', () => {
                const error = new Error('Already registered');
                error.name = 'NotSupportedError';
                throw error;
            });

            vi.resetModules();
            await import('../meter-processor.processor');

            expect(warnSpy).toHaveBeenCalledWith('meter-processor уже зарегистрирован');
            warnSpy.mockRestore();
        });

        it('should re-throw fatal errors', async () => {
            vi.stubGlobal('registerProcessor', () => {
                throw new Error('Fatal Processor Error');
            });

            vi.resetModules();
            await expect(import('../meter-processor.processor')).rejects.toThrow('Fatal Processor Error');
        });
    });
});
