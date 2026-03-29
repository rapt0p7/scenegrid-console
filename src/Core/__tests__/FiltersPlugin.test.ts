import { describe, it, expect, vi, beforeEach } from 'vitest';

import FiltersPlugin from '../FiltersPlugin.js';

describe('FiltersPlugin', () => {
    let mockContext: any;
    let mockAutomation: any;
    let mockFilter: any;
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
            createConvolver: vi.fn().mockReturnValue(mockConvolver),
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
            expect(node).toBe(mockConvolver);
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
                    durationMs: 100,
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
                    durationMs: 100,
                    automation: mockAutomation
                });
            }).not.toThrow();
            expect(mockAutomation.ramp).not.toHaveBeenCalled();
        });

        it('should call automation.ramp with the target parameter, duration, and default targetValue (20000)', () => {
            (FiltersPlugin as any).rampParameter({
                filterNode: mockFilter,
                parameterName: 'frequency',
                durationMs: 500,
                automation: mockAutomation
            });

            expect(mockAutomation.ramp).toHaveBeenCalledWith(mockFilter.frequency, 20_000, 500, 'linear');
        });

        it('should use custom targetValue if provided', () => {
            (FiltersPlugin as any).rampParameter({
                filterNode: mockFilter,
                parameterName: 'Q',
                targetValue: 10,
                durationMs: 300,
                automation: mockAutomation
            });

            expect(mockAutomation.ramp).toHaveBeenCalledWith(mockFilter.Q, 10, 300, 'linear');
        });
    });
});
