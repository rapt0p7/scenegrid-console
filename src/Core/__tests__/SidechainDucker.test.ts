import { AudioWorkletNode } from 'standardized-audio-context';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { safeDisconnect } from '@webaudio-core';

import SidechainDucker from '../SidechainDucker.js';

vi.mock('@webaudio-core', () => ({
    safeDisconnect: vi.fn()
}));

vi.mock('standardized-audio-context', () => {
    return {
        AudioWorkletNode: vi.fn().mockImplementation(function () {
            return {
                connect: vi.fn(),
                disconnect: vi.fn(),
                port: {
                    onmessage: null
                }
            };
        })
    };
});

vi.mock('../ducker-processor.processor.ts', () => ({
    default: 'mock-processor-url'
}));

const createMockAudioParameter = () => ({
    value: 0,
    setTargetAtTime: vi.fn()
});

const createMockNode = () => ({
    connect: vi.fn(),
    disconnect: vi.fn()
});

const createMockGain = () => ({
    ...createMockNode(),
    gain: createMockAudioParameter()
});

const createMockDelay = () => ({
    ...createMockNode(),
    delayTime: createMockAudioParameter()
});

const createMockWaveShaper = () => ({
    ...createMockNode(),
    curve: null
});

describe('SidechainDucker', () => {
    let mockContext: any;
    let mockTargetGain: any;
    let mockAutomation: any;
    let mockMaster: any;

    beforeEach(() => {
        vi.clearAllMocks();

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        mockContext = {
            createGain: vi.fn().mockImplementation(createMockGain),
            createDelay: vi.fn().mockImplementation(createMockDelay),
            createWaveShaper: vi.fn().mockImplementation(createMockWaveShaper),
            currentTime: 100,
            audioWorklet: {
                addModule: vi.fn().mockResolvedValue(undefined)
            }
        };

        mockTargetGain = createMockGain();
        mockAutomation = {};
        mockMaster = {};
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Initialization', () => {
        it('should throw an error if ctx or targetGainNode is missing', () => {
            expect(() => new SidechainDucker({} as any)).toThrow('SidechainDucker requires ctx and targetGainNode');

            expect(
                () =>
                    new SidechainDucker({
                        ctx: mockContext,
                        targetGainNode: null as any,
                        automation: mockAutomation,
                        masterOutput: mockMaster
                    })
            ).toThrow();
        });

        it('should initialize successfully with default parameters and create clipper', () => {
            const ducker = new SidechainDucker({
                ctx: mockContext,
                targetGainNode: mockTargetGain,
                automation: mockAutomation,
                masterOutput: mockMaster
            });

            expect(ducker).toBeDefined();
            expect(mockContext.createGain).toHaveBeenCalledTimes(2);
            expect(mockContext.createDelay).toHaveBeenCalledTimes(1);
            expect(mockContext.createWaveShaper).toHaveBeenCalledTimes(1);
        });
    });

    describe('Audio Routing (insertLookahead)', () => {
        let ducker: SidechainDucker;

        beforeEach(() => {
            ducker = new SidechainDucker({
                ctx: mockContext,
                targetGainNode: mockTargetGain,
                automation: mockAutomation,
                masterOutput: mockMaster
            });
        });

        it('should connect nodes correctly to insert lookahead delay and store nextNode', () => {
            const nextNode = createMockNode();
            ducker.insertLookahead(nextNode as any);

            expect(safeDisconnect).toHaveBeenCalledWith(mockTargetGain, nextNode);
            expect(mockTargetGain.connect).toHaveBeenCalled();
            expect((ducker as any).nextNode).toBe(nextNode);
        });

        it('should catch errors and warn if connection fails', () => {
            const nextNode = createMockNode();
            mockTargetGain.connect.mockImplementationOnce(() => {
                throw new Error('Connection failed');
            });

            ducker.insertLookahead(nextNode as any);

            expect(console.warn).toHaveBeenCalledWith(
                '[SidechainDucker] Failed to insert lookahead delay',
                expect.any(Error)
            );
        });
    });

    describe('Source Management (addSource / removeSource)', () => {
        let ducker: SidechainDucker;

        beforeEach(() => {
            ducker = new SidechainDucker({
                ctx: mockContext,
                targetGainNode: mockTargetGain,
                automation: mockAutomation,
                masterOutput: mockMaster
            });
        });

        it('should early return if sourceNode is invalid', () => {
            ducker.addSource(null as any);
            ducker.addSource({} as any);
            expect(mockContext.createGain).toHaveBeenCalledTimes(2);
        });

        it('should add a new source, create a gain node, and connect it', () => {
            const source = createMockNode();
            ducker.addSource(source as any, 0.5);

            expect(mockContext.createGain).toHaveBeenCalledTimes(3);
            expect(source.connect).toHaveBeenCalled();
        });

        it('should catch errors during source connection, warn, and safely disconnect the created gain', () => {
            const source = createMockNode();
            source.connect.mockImplementationOnce(() => {
                throw new Error('Connection failed');
            });

            ducker.addSource(source as any, 0.5);

            expect(console.warn).toHaveBeenCalledWith('[SidechainDucker] Failed to connect source', expect.any(Error));
            expect(safeDisconnect).toHaveBeenCalled();
        });

        it('should update intensity if source already exists', () => {
            const source = createMockNode();

            ducker.addSource(source as any, 0.5);
            const createdGain = (mockContext.createGain as any).mock.results[2].value;

            ducker.addSource(source as any, 0.8);

            expect(mockContext.createGain).toHaveBeenCalledTimes(3);
            expect(createdGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, 100, 0.01);
        });

        it('should early return when removing invalid or non-existent source', () => {
            ducker.removeSource(null as any);
            ducker.removeSource(createMockNode() as any);
            expect(safeDisconnect).not.toHaveBeenCalled();
        });

        it('should remove an existing source and disconnect its nodes', () => {
            const source = createMockNode();
            ducker.addSource(source as any, 0.5);

            vi.mocked(safeDisconnect).mockClear();

            ducker.removeSource(source as any);

            expect(safeDisconnect).toHaveBeenCalledTimes(2);
        });
    });

    describe('Lifecycle (start / stop / dispose)', () => {
        let ducker: SidechainDucker;

        beforeEach(() => {
            ducker = new SidechainDucker({
                ctx: mockContext,
                targetGainNode: mockTargetGain,
                automation: mockAutomation,
                masterOutput: mockMaster
            });
        });

        it('should clean up resources and properly RESTORE the graph on dispose', () => {
            const source = createMockNode();
            const nextNode = createMockNode();

            ducker.insertLookahead(nextNode as any);
            ducker.addSource(source as any, 0.5);

            vi.mocked(safeDisconnect).mockClear();
            mockTargetGain.connect.mockClear();

            ducker.dispose();

            expect(safeDisconnect).toHaveBeenCalledWith((ducker as any).clipper);

            expect(mockTargetGain.connect).toHaveBeenCalledWith(nextNode);
            expect((ducker as any).nextNode).toBeNull();
            expect((ducker as any).sources.size).toBe(0);
        });

        it('should start successfully, create AudioWorkletNode, and route through clipper', async () => {
            await ducker.start();

            expect(mockContext.audioWorklet.addModule).toHaveBeenCalledWith('mock-processor-url');
            expect(AudioWorkletNode).toHaveBeenCalledTimes(1);

            const processorInstance = (ducker as any).processor;
            const clipperInstance = (ducker as any).clipper;
            const mergeGainInstance = (ducker as any).mergeGain;

            expect(processorInstance).toBeDefined();

            expect(mergeGainInstance.connect).toHaveBeenCalledWith(clipperInstance);
            expect(clipperInstance.connect).toHaveBeenCalledWith(processorInstance);

            processorInstance.port.onmessage({ data: { envelope: 0.85 } });
            expect(ducker.activeEnvelope).toBe(0.85);

            mockContext.audioWorklet.addModule.mockClear();
            await ducker.start();
            expect(mockContext.audioWorklet.addModule).not.toHaveBeenCalled();
        });

        it('should catch errors during start if addModule fails', async () => {
            mockContext.audioWorklet.addModule.mockRejectedValueOnce(new Error('Module Load Failed'));

            await ducker.start();

            expect(console.error).toHaveBeenCalledWith('AudioWorklet initialization failed', expect.any(Error));
        });

        it('should stop and disconnect processor AND clipper if running', async () => {
            await ducker.start();

            const processorInstance = (ducker as any).processor;
            const clipperInstance = (ducker as any).clipper;
            const mergeGainInstance = (ducker as any).mergeGain;

            vi.mocked(safeDisconnect).mockClear();
            ducker.stop();

            expect(safeDisconnect).toHaveBeenCalledWith(mergeGainInstance, clipperInstance);
            expect(safeDisconnect).toHaveBeenCalledWith(clipperInstance, processorInstance);

            expect((ducker as any).processor).toBeNull();
            expect((ducker as any).duckingGain.gain.setTargetAtTime).toHaveBeenCalledWith(1, 100, 0.05);
        });

        it('should safely call stop when processor is not initialized', () => {
            ducker.stop();
            expect((ducker as any).duckingGain.gain.setTargetAtTime).toHaveBeenCalledWith(1, 100, 0.05);
        });
    });
});
