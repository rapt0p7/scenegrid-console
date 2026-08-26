import WorkletLoader from '@infrastructure/context/WorkletLoader.js';
import { safeDisconnect } from '@infrastructure/utils/safeDisconnect.js';
// oxlint-disable unicorn/no-useless-undefined
import { AudioWorkletNode } from 'standardized-audio-context';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import SidechainDucker from '../SidechainDucker.js';

vi.mock('@infrastructure', () => ({
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

vi.mock('../../worklets/ducker.processor.js?worklet', () => ({
    default: 'mock-raw-processor-code'
}));

vi.mock('@infrastructure/utils/safeDisconnect.js', () => ({
    safeDisconnect: vi.fn()
}));

vi.mock('@infrastructure/context/WorkletLoader.js', () => ({
    default: {
        loadModule: vi.fn().mockResolvedValue(undefined)
    }
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
                        targetGainNode: null as any
                    })
            ).toThrow();
        });

        it('should initialize successfully with default parameters and create clipper', () => {
            const ducker = new SidechainDucker({
                ctx: mockContext,
                targetGainNode: mockTargetGain
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
                targetGainNode: mockTargetGain
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
                targetGainNode: mockTargetGain
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
            const createdGain = mockContext.createGain.mock.results[2].value;

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
            if (!source.disconnect) {
                source.disconnect = vi.fn();
            }

            ducker.addSource(source as any, 0.5);

            vi.mocked(safeDisconnect).mockClear();
            vi.mocked(source.disconnect).mockClear();

            ducker.removeSource(source as any);

            expect(safeDisconnect).toHaveBeenCalledTimes(1);
            expect(source.disconnect).toHaveBeenCalledTimes(1);
        });
    });

    describe('Lifecycle (start / stop / dispose)', () => {
        let ducker: SidechainDucker;

        beforeEach(() => {
            ducker = new SidechainDucker({
                ctx: mockContext,
                targetGainNode: mockTargetGain
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

            expect(WorkletLoader.loadModule).toHaveBeenCalledWith(mockContext, 'mock-raw-processor-code');
            expect(AudioWorkletNode).toHaveBeenCalledTimes(1);

            const processorInstance = (ducker as any).processor;
            const clipperInstance = (ducker as any).clipper;
            const mergeGainInstance = (ducker as any).mergeGain;

            expect(processorInstance).toBeDefined();

            expect(mergeGainInstance.connect).toHaveBeenCalledWith(clipperInstance);
            expect(clipperInstance.connect).toHaveBeenCalledWith(processorInstance);

            processorInstance.port.onmessage({ data: { envelope: 0.85 } });
            expect(ducker.activeEnvelope).toBe(0.85);

            vi.mocked(WorkletLoader.loadModule).mockClear();
            await ducker.start();
            expect(WorkletLoader.loadModule).not.toHaveBeenCalled();
        });

        it('should catch errors during start if WorkletLoader fails', async () => {
            vi.mocked(WorkletLoader.loadModule).mockRejectedValueOnce(new Error('Module Load Failed'));

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

    it('should initialize clipper with a [-1, 1] Float32Array curve', () => {
        // oxlint-disable-next-line no-unused-vars
        const ducker = new SidechainDucker({
            ctx: mockContext,
            targetGainNode: mockTargetGain
        });

        const createdWaveShaper = mockContext.createWaveShaper.mock.results[0].value;
        expect(createdWaveShaper.curve).toEqual(new Float32Array([-1, 1]));
    });

    it('should return early without querying or modifying internal maps when source is invalid or not tracked', () => {
        const ducker = new SidechainDucker({
            ctx: mockContext,
            targetGainNode: mockTargetGain
        });
        const trackedSource = createMockNode();
        const untrackedSource = createMockNode();
        ducker.addSource(trackedSource as any, 0.5);

        const mapGetSpy = vi.spyOn((ducker as any).sourceGainMap, 'get');
        const sourcesDeleteSpy = vi.spyOn((ducker as any).sources, 'delete');
        vi.mocked(safeDisconnect).mockClear();

        ducker.removeSource(null as any);
        ducker.removeSource(untrackedSource as any);

        expect(mapGetSpy).not.toHaveBeenCalled();
        expect(sourcesDeleteSpy).not.toHaveBeenCalled();
        expect(safeDisconnect).not.toHaveBeenCalled();
        expect((ducker as any).sources.has(trackedSource)).toBe(true);
    });

    it('should set isDisposed to true and prevent start() from initializing', async () => {
        const ducker = new SidechainDucker({
            ctx: mockContext,
            targetGainNode: mockTargetGain
        });
        ducker.dispose();

        await ducker.start();

        expect((ducker as any).isDisposed).toBe(true);
        expect(WorkletLoader.loadModule).not.toHaveBeenCalled();
        expect(AudioWorkletNode).not.toHaveBeenCalled();
    });

    it('should catch error and log warning when restoring graph connection fails during dispose', () => {
        const ducker = new SidechainDucker({
            ctx: mockContext,
            targetGainNode: mockTargetGain
        });
        const nextNode = createMockNode();
        ducker.insertLookahead(nextNode as any);
        const error = new Error('Reconnection error');
        mockTargetGain.connect.mockImplementationOnce(() => {
            throw error;
        });

        ducker.dispose();

        expect(console.warn).toHaveBeenCalledWith(
            '[SidechainDucker] Failed to restore graph connection during dispose',
            error
        );
    });

    it('should set running to true immediately and prevent concurrent start calls while loading worklet', async () => {
        const ducker = new SidechainDucker({
            ctx: mockContext,
            targetGainNode: mockTargetGain
        });
        let resolveLoad!: () => void;
        const loadPromise = new Promise<void>(resolve => {
            resolveLoad = resolve;
        });
        vi.mocked(WorkletLoader.loadModule).mockReturnValueOnce(loadPromise);

        const firstStart = ducker.start();
        expect((ducker as any).running).toBe(true);

        const secondStart = ducker.start();

        resolveLoad();
        await Promise.all([firstStart, secondStart]);

        expect(WorkletLoader.loadModule).toHaveBeenCalledTimes(1);
        expect(AudioWorkletNode).toHaveBeenCalledTimes(1);
    });

    it('should not start if already running even when processor is absent', async () => {
        const ducker = new SidechainDucker({
            ctx: mockContext,
            targetGainNode: mockTargetGain
        });
        (ducker as any).running = true;

        await ducker.start();

        expect(WorkletLoader.loadModule).not.toHaveBeenCalled();
    });

    it('should not reload worklet module or recreate processor if processor already exists', async () => {
        const ducker = new SidechainDucker({
            ctx: mockContext,
            targetGainNode: mockTargetGain
        });
        const existingProcessor = {
            connect: vi.fn(),
            disconnect: vi.fn(),
            port: { onmessage: null }
        };
        (ducker as any).processor = existingProcessor;

        await ducker.start();

        expect(WorkletLoader.loadModule).not.toHaveBeenCalled();
        expect(AudioWorkletNode).not.toHaveBeenCalled();
        expect((ducker as any).processor).toBe(existingProcessor);
    });

    it('should abort start and not instantiate AudioWorkletNode if disposed during module loading', async () => {
        const ducker = new SidechainDucker({
            ctx: mockContext,
            targetGainNode: mockTargetGain
        });
        let resolveLoad!: () => void;
        const loadPromise = new Promise<void>(resolve => {
            resolveLoad = resolve;
        });
        vi.mocked(WorkletLoader.loadModule).mockReturnValueOnce(loadPromise);

        const startPromise = ducker.start();
        ducker.dispose();
        resolveLoad();
        await startPromise;

        expect(AudioWorkletNode).not.toHaveBeenCalled();
        expect((ducker as any).processor).toBeNull();
    });

    it('should reset running flag to false on initialization failure and allow retry', async () => {
        const ducker = new SidechainDucker({
            ctx: mockContext,
            targetGainNode: mockTargetGain
        });
        vi.mocked(WorkletLoader.loadModule).mockRejectedValueOnce(new Error('Load Failed'));

        await ducker.start();

        expect((ducker as any).running).toBe(false);

        vi.mocked(WorkletLoader.loadModule).mockResolvedValueOnce(undefined);
        await ducker.start();

        expect(AudioWorkletNode).toHaveBeenCalledTimes(1);
        expect((ducker as any).running).toBe(true);
    });

    it('should set running to false when stopped and allow restarting', async () => {
        const ducker = new SidechainDucker({
            ctx: mockContext,
            targetGainNode: mockTargetGain
        });
        await ducker.start();
        expect((ducker as any).running).toBe(true);

        ducker.stop();

        expect((ducker as any).running).toBe(false);

        await ducker.start();

        expect(AudioWorkletNode).toHaveBeenCalledTimes(2);
        expect((ducker as any).running).toBe(true);
    });

    describe('removeAllSources', () => {
        it('should disconnect all sources from gains, disconnect gains from mergeGain, and clear maps', () => {
            const ducker = new SidechainDucker({
                ctx: mockContext,
                targetGainNode: mockTargetGain
            });
            const sourceA = createMockNode();
            const sourceB = createMockNode();
            ducker.addSource(sourceA as any, 0.4);
            ducker.addSource(sourceB as any, 0.7);

            const gainA = (ducker as any).sourceGainMap.get(sourceA);
            const gainB = (ducker as any).sourceGainMap.get(sourceB);
            const mergeGain = (ducker as any).mergeGain;

            vi.mocked(safeDisconnect).mockClear();

            ducker.removeAllSources();

            expect(sourceA.disconnect).toHaveBeenCalledWith(gainA);
            expect(sourceB.disconnect).toHaveBeenCalledWith(gainB);
            expect(safeDisconnect).toHaveBeenCalledWith(gainA, mergeGain);
            expect(safeDisconnect).toHaveBeenCalledWith(gainB, mergeGain);
            expect((ducker as any).sources.size).toBe(0);
            expect((ducker as any).sourceGainMap.size).toBe(0);
            expect((ducker as any).intensityMap.size).toBe(0);
        });

        it('should catch source disconnect errors and still safely disconnect the gain node', () => {
            const ducker = new SidechainDucker({
                ctx: mockContext,
                targetGainNode: mockTargetGain
            });
            const source = createMockNode();
            source.disconnect.mockImplementationOnce(() => {
                throw new Error('Disconnect failed');
            });
            ducker.addSource(source as any, 0.5);
            const gain = (ducker as any).sourceGainMap.get(source);
            const mergeGain = (ducker as any).mergeGain;

            vi.mocked(safeDisconnect).mockClear();

            expect(() => {
                ducker.removeAllSources();
            }).not.toThrow();
            expect(safeDisconnect).toHaveBeenCalledWith(gain, mergeGain);
        });
    });
});
