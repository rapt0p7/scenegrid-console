// noinspection D

import fc from 'fast-check';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import FiltersPlugin from '../FiltersPlugin.js';

describe('FiltersPlugin', () => {
    let mockContext: any;
    let mockAutomation: any;
    let mockFilter: any;
    // oxlint-disable-next-line no-unused-vars
    let mockConvolver: any;
    let mockBuffer: any;
    let mockLeftChannel: Float32Array;
    let mockRightChannel: Float32Array;

    beforeEach(() => {
        vi.clearAllMocks();

        (FiltersPlugin as any).impulseCache.clear();

        mockLeftChannel = new Float32Array(100);
        mockRightChannel = new Float32Array(100);

        mockBuffer = {
            getChannelData: vi.fn(channel => (channel === 0 ? mockLeftChannel : mockRightChannel))
        };

        mockFilter = {
            type: 'lowpass',
            frequency: { value: 0 },
            Q: { value: 0 }
        };

        mockConvolver = {
            buffer: null
        };

        mockContext = {
            sampleRate: 10,
            createBiquadFilter: vi.fn().mockReturnValue(mockFilter),
            createConvolver: vi.fn(() => ({ buffer: null })),
            createBuffer: vi.fn().mockReturnValue(mockBuffer)
        };

        mockAutomation = {
            set: vi.fn(),
            ramp: vi.fn()
        };
    });

    describe('createNode', () => {
        it('should return null if config.type is falsy', () => {
            const node = FiltersPlugin.createNode(mockContext, mockAutomation, { type: '' as any });
            expect(node).toBeNull();
        });

        it('should create and return a Reverb convolver node if type is "reverb"', () => {
            const createReverbSpy = vi.spyOn(FiltersPlugin as any, 'createReverb');

            const node = FiltersPlugin.createNode(mockContext, mockAutomation, { type: 'reverb' });

            expect(createReverbSpy).toHaveBeenCalledWith(mockContext, { type: 'reverb' });
            expect(mockContext.createConvolver).toHaveBeenCalledTimes(1);
            expect(node).toBeDefined();
            expect((node as any)?.buffer).toBe(mockBuffer);
        });

        it('should catch errors silently if setting filter.type throws an error', () => {
            Object.defineProperty(mockFilter, 'type', {
                set: () => {
                    throw new Error('Unsupported filter type');
                }
            });

            expect(() => {
                FiltersPlugin.createNode(mockContext, mockAutomation, { type: 'alien-filter' as any });
            }).not.toThrow();
        });

        it('should map frequency and Q to the automation engine if provided', () => {
            FiltersPlugin.createNode(mockContext, mockAutomation, {
                type: 'lowpass',
                frequency: 1200,
                Q: 5
            });

            expect(mockAutomation.set).toHaveBeenCalledTimes(2);
            expect(mockAutomation.set).toHaveBeenCalledWith(mockFilter.frequency, 1200);
            expect(mockAutomation.set).toHaveBeenCalledWith(mockFilter.Q, 5);
        });

        it('should skip mapping frequency and Q if they are undefined', () => {
            mockAutomation.set.mockClear();

            FiltersPlugin.createNode(mockContext, mockAutomation, {
                type: 'highpass',
                frequency: undefined as any,
                Q: undefined as any
            });

            expect(mockAutomation.set).not.toHaveBeenCalled();
        });

        it('should assign the specified filter type to the biquad filter node', () => {
            mockFilter.type = 'allpass';

            const node = FiltersPlugin.createNode(mockContext, mockAutomation, {
                type: 'bandpass'
            });

            expect(node).toBe(mockFilter);
            expect((node as any).type).toBe('bandpass');
        });

        it('should fall back to "allpass" when config.type is a falsy non-empty value', () => {
            mockFilter.type = 'lowpass';

            const node = FiltersPlugin.createNode(mockContext, mockAutomation, {
                type: 0 as any
            });

            expect(node).toBe(mockFilter);
            expect((node as any).type).toBe('allpass');
        });
    });

    describe('Reverb Generation & Caching', () => {
        it('should generate an impulse response and cache it on the first call', () => {
            const node = (FiltersPlugin as any).createReverb(mockContext, { reverbTime: 3, reverbDecay: 1 });

            expect(mockContext.createBuffer).toHaveBeenCalledWith(2, 30, 10);
            expect(node.buffer).toBe(mockBuffer);
            expect((FiltersPlugin as any).impulseCache.has('3_1_10')).toBe(true);
        });

        it('should use default time (2) and decay (2) if not provided in config', () => {
            (FiltersPlugin as any).createReverb(mockContext, {});

            expect(mockContext.createBuffer).toHaveBeenCalledWith(2, 20, 10);
            expect((FiltersPlugin as any).impulseCache.has('2_2_10')).toBe(true);
        });

        it('should reuse the cached impulse response on subsequent calls with the same parameters', () => {
            (FiltersPlugin as any).createReverb(mockContext, { reverbTime: 2, reverbDecay: 2 });
            expect(mockContext.createBuffer).toHaveBeenCalledTimes(1);

            const node2 = (FiltersPlugin as any).createReverb(mockContext, { reverbTime: 2, reverbDecay: 2 });

            expect(mockContext.createBuffer).toHaveBeenCalledTimes(1);
            expect(node2.buffer).toBe(mockBuffer);
        });
    });

    describe('rampParameter (Private Method)', () => {
        it('should safely early return if filterNode is falsy', () => {
            expect(() => {
                (FiltersPlugin as any).rampParameter({
                    filterNode: null,
                    parameterName: 'frequency',
                    duration: 100,
                    automation: mockAutomation
                });
            }).not.toThrow();
            expect(mockAutomation.ramp).not.toHaveBeenCalled();
        });

        it('should safely early return if the specified parameterName does not exist on the node', () => {
            expect(() => {
                (FiltersPlugin as any).rampParameter({
                    filterNode: mockFilter,
                    parameterName: 'non_existent_param',
                    duration: 100,
                    automation: mockAutomation
                });
            }).not.toThrow();
            expect(mockAutomation.ramp).not.toHaveBeenCalled();
        });

        it('should call automation.ramp with the target parameter, duration, and default targetValue (20000)', () => {
            (FiltersPlugin as any).rampParameter({
                filterNode: mockFilter,
                parameterName: 'frequency',
                duration: 500,
                automation: mockAutomation
            });

            expect(mockAutomation.ramp).toHaveBeenCalledWith(mockFilter.frequency, 20_000, 500, 'linear');
        });

        it('should use custom targetValue if provided', () => {
            (FiltersPlugin as any).rampParameter({
                filterNode: mockFilter,
                parameterName: 'Q',
                targetValue: 10,
                duration: 300,
                automation: mockAutomation
            });

            expect(mockAutomation.ramp).toHaveBeenCalledWith(mockFilter.Q, 10, 300, 'linear');
        });
    });

    describe('createReverb', () => {
        it('should attach the cached impulse buffer to newly created convolver nodes on cache hits', () => {
            const firstNode = (FiltersPlugin as any).createReverb(mockContext, {
                reverbTime: 2,
                reverbDecay: 2
            });
            const cachedImpulse = firstNode.buffer;
            expect(mockContext.createBuffer).toHaveBeenCalledTimes(1);

            const secondNode = (FiltersPlugin as any).createReverb(mockContext, {
                reverbTime: 2,
                reverbDecay: 2
            });

            expect(mockContext.createBuffer).toHaveBeenCalledTimes(1);
            expect(secondNode).not.toBe(firstNode);
            expect(secondNode.buffer).toBe(cachedImpulse);
        });
    });

    describe('generateImpulseResponse', () => {
        it('should compute exact recursive dampening, noise normalization, and exponential decay values', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.75);

            const sampleRate = 2;
            const duration = 1;
            const decay = 2;
            const length = sampleRate * duration;

            const leftChannel = new Float32Array(length);
            const rightChannel = new Float32Array(length);
            const buffer = {
                getChannelData: vi.fn(ch => (ch === 0 ? leftChannel : rightChannel))
            };

            const ctx: any = {
                sampleRate,
                createBuffer: vi.fn().mockReturnValue(buffer)
            };

            const expectedSample0 = 0.25;

            const expectedSample1 = 0.09375;

            (FiltersPlugin as any).generateImpulseResponse(ctx, duration, decay);

            expect(leftChannel[0]).toBeCloseTo(expectedSample0, 5);
            expect(leftChannel[1]).toBeCloseTo(expectedSample1, 5);
            expect(rightChannel[0]).toBeCloseTo(expectedSample0, 5);
            expect(rightChannel[1]).toBeCloseTo(expectedSample1, 5);
        });

        it('should generate stereo noise channels independently', () => {
            vi.spyOn(Math, 'random').mockReturnValueOnce(0.75).mockReturnValueOnce(0.25);

            const leftChannel = new Float32Array(1);
            const rightChannel = new Float32Array(1);
            const buffer = {
                getChannelData: vi.fn(ch => (ch === 0 ? leftChannel : rightChannel))
            };
            const ctx: any = {
                sampleRate: 1,
                createBuffer: vi.fn().mockReturnValue(buffer)
            };

            (FiltersPlugin as any).generateImpulseResponse(ctx, 1, 1);

            expect(leftChannel[0]).toBeCloseTo(0.25, 5);
            expect(rightChannel[0]).toBeCloseTo(-0.25, 5);
        });
    });

    describe('generateImpulseResponse invariants', () => {
        it('should always decay towards zero over time and stay bounded within [-1, 1]', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 10, max: 100 }),
                    fc.integer({ min: 1, max: 5 }),
                    fc.integer({ min: 1, max: 4 }),
                    (sampleRate, duration, decay) => {
                        const length = sampleRate * duration;
                        const leftChannel = new Float32Array(length);
                        const rightChannel = new Float32Array(length);
                        const buffer = {
                            getChannelData: (ch: number) => (ch === 0 ? leftChannel : rightChannel)
                        };
                        const ctx: any = {
                            sampleRate,
                            createBuffer: vi.fn().mockReturnValue(buffer)
                        };

                        (FiltersPlugin as any).generateImpulseResponse(ctx, duration, decay);

                        for (let i = 0; i < length; i++) {
                            expect(leftChannel[i]).toBeGreaterThanOrEqual(-1);
                            expect(leftChannel[i]).toBeLessThanOrEqual(1);
                        }

                        const lastIndex = length - 1;
                        const tailEnvelope = Math.pow(1 - lastIndex / length, decay);
                        expect(Math.abs(leftChannel[lastIndex])).toBeLessThanOrEqual(tailEnvelope);
                        expect(Math.abs(rightChannel[lastIndex])).toBeLessThanOrEqual(tailEnvelope);
                    }
                )
            );
        });
    });
});
