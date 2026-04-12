// noinspection D

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AudioNodeFactory } from '@infrastructure/nodes/AudioNodeFactory.js';
import { NodeChain } from '@infrastructure/nodes/NodeChain.js';

import { SoundInstance } from '../SoundInstance.js';

import type AudioContextManager from '../../context/AudioContextManager.js';
import type { SoundId } from '@domain/Types/Branded';
import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';

function createMockAudioContext() {
    const mockSourceNode = {
        buffer: null,
        playbackRate: { value: 1 },
        loop: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    };

    const mockGainNode = {
        gain: {
            value: 1,
            setValueAtTime: vi.fn(),
            cancelScheduledValues: vi.fn(),
            setTargetAtTime: vi.fn()
        },
        connect: vi.fn(),
        disconnect: vi.fn()
    };

    return {
        currentTime: 0,
        createBufferSource: vi.fn().mockReturnValue(mockSourceNode),
        createGain: vi.fn().mockReturnValue(mockGainNode),
        _mockSourceNode: mockSourceNode,
        _mockGainNode: mockGainNode
    };
}

describe('SoundInstance (Playback & Virtualization Math)', () => {
    let mockContext: any;
    let mockContextManager: AudioContextManager;
    let mockFactory: AudioNodeFactory;
    let mockBuffer: AudioBuffer;
    let mockAutomation: AutomationEngine;
    let instance: SoundInstance;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContext = createMockAudioContext();

        mockContextManager = {
            context: mockContext,
            resume: vi.fn()
        } as unknown as AudioContextManager;

        mockFactory = {
            createGain: () => mockContext.createGain(),
            createStereoPanner: () => ({
                pan: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
                connect: vi.fn(),
                disconnect: vi.fn()
            }),
            createFilter: () => ({
                frequency: { value: 22_000, setValueAtTime: vi.fn() },
                connect: vi.fn(),
                disconnect: vi.fn()
            })
        } as unknown as AudioNodeFactory;

        mockBuffer = {
            duration: 10,
            length: 441_000,
            sampleRate: 44_100,
            numberOfChannels: 2,
            getChannelData: vi.fn()
        } as unknown as AudioBuffer;

        mockAutomation = {
            ramp: vi.fn(),
            set: vi.fn(),
            cancelScheduledValues: vi.fn()
        } as unknown as AutomationEngine;

        instance = new SoundInstance(
            'test_sound' as SoundId,
            mockContextManager,
            mockFactory,
            mockBuffer,
            mockAutomation
        );
    });

    it('should correctly initialize and play', () => {
        expect(instance.state).toBe('idle');

        instance.play();

        expect(mockContext.createBufferSource).toHaveBeenCalled();
        expect(mockContext._mockSourceNode.start).toHaveBeenCalledWith(0, 0, undefined);
        expect(instance.state).toBe('playing');
    });

    it('should correctly stop and emit events', () => {
        const endedSpy = vi.fn();
        const stoppedSpy = vi.fn();

        const offEnded = instance.on('ended', endedSpy);
        const offStopped = instance.on('stopped', stoppedSpy);

        instance.play();
        instance.stop();

        expect(mockContext._mockSourceNode.stop).toHaveBeenCalled();
        expect(mockContext._mockSourceNode.disconnect).toHaveBeenCalled();
        expect(instance.state).toBe('stopped');

        expect(stoppedSpy).toHaveBeenCalledTimes(1);
        expect(endedSpy).toHaveBeenCalledTimes(1);

        offEnded();
        offStopped();
    });

    it('should correctly calculate currentTime during playback', () => {
        instance.play();
        mockContext.currentTime = 3.5;
        expect(instance.currentTime).toBe(3.5);

        mockContext.currentTime = 12;
        expect(instance.currentTime).toBe(2);
    });

    it('should completely destroy hardware node on virtualize()', () => {
        instance.play();
        instance.virtualize();

        expect(instance.state).toBe('virtual');
        expect(mockContext._mockSourceNode.disconnect).toHaveBeenCalled();
        expect(mockContext._mockSourceNode.stop).toHaveBeenCalled();
    });

    it('should preserve synchronization on devirtualize() (Play from elapsed time)', () => {
        instance.play();
        mockContext.currentTime = 2;
        instance.virtualize();

        mockContext.currentTime = 7;
        mockContext._mockSourceNode.start.mockClear();

        instance.devirtualize();

        expect(mockContext._mockSourceNode.start).toHaveBeenCalledWith(7, 7);
        expect(instance.state).toBe('playing');
    });

    it('should correctly handle loop math during devirtualize()', () => {
        instance.play();
        instance.virtualize();
        mockContext.currentTime = 24;

        mockContext._mockSourceNode.start.mockClear();
        instance.devirtualize();

        expect(mockContext._mockSourceNode.start).toHaveBeenCalledWith(24, 4);
    });
});

describe('SoundInstance (Pause, Resume & Parameters)', () => {
    let mockContext: any;
    let mockContextManager: AudioContextManager;
    let mockFactory: AudioNodeFactory;
    let mockBuffer: AudioBuffer;
    let mockAutomation: AutomationEngine;
    let instance: SoundInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        mockContext = createMockAudioContext();

        mockContextManager = {
            context: mockContext,
            resume: vi.fn()
        } as unknown as AudioContextManager;

        mockFactory = {
            createGain: () => mockContext.createGain(),
            createPanner: vi.fn()
        } as unknown as AudioNodeFactory;

        mockBuffer = {
            duration: 10,
            length: 441_000,
            sampleRate: 44_100,
            numberOfChannels: 2,
            getChannelData: vi.fn()
        } as unknown as AudioBuffer;

        mockAutomation = {
            ramp: vi.fn(),
            set: vi.fn(),
            cancelScheduledValues: vi.fn()
        } as unknown as AutomationEngine;

        instance = new SoundInstance(
            'test_sound' as SoundId,
            mockContextManager,
            mockFactory,
            mockBuffer,
            mockAutomation
        );
    });

    it('should correctly PAUSE and RESUME playback, keeping track of time', () => {
        instance.play();
        mockContext.currentTime = 3;
        instance.pause();

        expect(instance.state).toBe('paused');
        expect(mockContext._mockSourceNode.stop).toHaveBeenCalled();

        mockContext.currentTime = 8;
        mockContext._mockSourceNode.start.mockClear();

        instance.resume();

        expect(instance.state).toBe('playing');
        expect(mockContext._mockSourceNode.start).toHaveBeenCalledWith(8, 3);
    });

    it('should ignore pause() if already paused or idle', () => {
        instance.pause();
        expect(instance.state).toBe('idle');

        instance.play();
        instance.pause();
        expect(instance.state).toBe('paused');

        mockContext._mockSourceNode.stop.mockClear();
        instance.pause();
        expect(mockContext._mockSourceNode.stop).not.toHaveBeenCalled();
    });

    it('should dynamically update playbackRate (Pitch/Speed)', () => {
        instance.setRate(1.5);
        instance.play();
        expect(mockContext._mockSourceNode.playbackRate.value).toBe(1.5);

        instance.setRate(0.8);
        expect(mockContext._mockSourceNode.playbackRate.value).toBe(0.8);
    });

    it('should dynamically update loop state', () => {
        instance.setLoop(true);
        instance.play();
        expect(mockContext._mockSourceNode.loop).toBe(true);

        instance.setLoop(false);
        expect(mockContext._mockSourceNode.loop).toBe(false);
    });

    it('should clear all event listeners on resetForReuse()', () => {
        const spy = vi.fn();
        instance.on('ended', spy);

        instance.play();
        instance.resetForReuse();

        const onEndedCallback = mockContext._mockSourceNode.addEventListener.mock.calls[0][1];
        onEndedCallback();

        expect(spy).not.toHaveBeenCalled();
    });
});

describe('SoundInstance (Coverage & Edge Cases)', () => {
    let mockContext: any;
    let mockContextManager: AudioContextManager;
    let mockFactory: AudioNodeFactory;
    let mockBuffer: AudioBuffer;
    let mockAutomation: AutomationEngine;
    let instance: SoundInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        mockContext = createMockAudioContext();
        mockContextManager = { context: mockContext } as unknown as AudioContextManager;

        mockFactory = {
            createGain: () => mockContext.createGain(),
            createStereoPanner: () => ({ pan: {}, connect: vi.fn(), disconnect: vi.fn() }),
            createFilter: () => ({ frequency: {}, connect: vi.fn(), disconnect: vi.fn() })
        } as unknown as AudioNodeFactory;

        mockBuffer = { duration: 10 } as unknown as AudioBuffer;
        mockAutomation = { ramp: vi.fn() } as unknown as AutomationEngine;

        instance = new SoundInstance('test' as SoundId, mockContextManager, mockFactory, mockBuffer, mockAutomation, {
            hasPanner: true
        });
    });

    it('should handle getters correctly', () => {
        expect(instance.outputNode).toBeDefined();
        expect(instance.instanceGain).toBeDefined();
        expect(instance.duration).toBe(10);
        expect(instance.pannerNode).toBeDefined();

        expect(instance.currentTime).toBe(0);
    });

    it('should handle null buffer gracefully (Early Returns)', () => {
        const noBufferInstance = new SoundInstance(
            'test' as SoundId,
            mockContextManager,
            mockFactory,
            null as any,
            mockAutomation
        );

        expect(noBufferInstance.duration).toBe(0);
        expect(noBufferInstance.currentTime).toBe(0); // !this.#buffer return 0

        expect(() => noBufferInstance.play()).not.toThrow(); // !this.#buffer early return
    });

    it('should cover all branch cases in automate()', () => {
        const filterSpy = vi
            .spyOn(NodeChain.prototype, 'mainFilterNode', 'get')
            .mockReturnValue({ frequency: {} } as any);

        const pannerSpy = vi.spyOn(NodeChain.prototype, 'pannerNode', 'get').mockReturnValue({ pan: {} } as any);

        instance.automate('pitch', 1.5);

        instance.play();

        instance.automate('pitch', 1.5);
        instance.automate('gain', 0.5);
        instance.automate('pan', 1);
        instance.automate('filterFrequency', 1000);

        expect(mockAutomation.ramp).toHaveBeenCalledTimes(4);

        filterSpy.mockRestore();
        pannerSpy.mockRestore();
    });

    it('should stop currently playing source if play() is called again', () => {
        instance.play();
        const stopSpy = vi.spyOn(instance, 'stop');
        instance.play();
        expect(stopSpy).toHaveBeenCalled();
    });

    it('should handle stop() edge cases (when > 0, exceptions)', () => {
        instance.stop();

        instance.play();
        instance.stop(5);
        expect(mockContext._mockSourceNode.stop).toHaveBeenCalled();

        instance.play();
        mockContext._mockSourceNode.stop.mockImplementationOnce(() => {
            throw new Error('WebAudio Error');
        });
        expect(() => instance.stop(5)).not.toThrow();

        instance.play();
        mockContext._mockSourceNode.stop.mockImplementationOnce(() => {
            throw new Error('WebAudio Error');
        });
        expect(() => instance.stop()).not.toThrow();
    });

    it('should handle cancelScheduled() edge cases', () => {
        expect(() => instance.cancelScheduled()).not.toThrow();

        instance.play();
        instance.cancelScheduled();

        expect(instance.state).toBe('stopped');
        expect(mockContext._mockSourceNode.removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function));

        instance.play();
        mockContext._mockSourceNode.stop.mockImplementationOnce(() => {
            throw new Error('Stop Error');
        });
        mockContext._mockGainNode.gain.cancelScheduledValues.mockImplementationOnce(() => {
            throw new Error('Gain Error');
        });

        expect(() => instance.cancelScheduled()).not.toThrow();
    });

    it('should support pre-allocation with null buffer and subsequent rebind', () => {
        const preAllocated = new SoundInstance(
            '__RESERVED__' as SoundId,
            mockContextManager,
            mockFactory,
            null,
            mockAutomation
        );

        expect(preAllocated.state).toBe('idle');
        expect(preAllocated.duration).toBe(0);

        preAllocated.play();
        expect(mockContext.createBufferSource).not.toHaveBeenCalled();

        preAllocated.rebind('real_sound' as SoundId, mockBuffer);
        expect(preAllocated.duration).toBe(10);

        preAllocated.play();
        expect(mockContext.createBufferSource).toHaveBeenCalled();
        expect(preAllocated.state).toBe('playing');
    });

    it('should execute dispose() correctly', () => {
        instance.play();
        const stopSpy = vi.spyOn(instance, 'stop');

        const disposedSpy = vi.fn();
        instance.on('disposed', disposedSpy);

        instance.dispose();

        expect(stopSpy).toHaveBeenCalled();
        expect(instance.state).toBe('idle');
        expect(instance.duration).toBe(0);

        expect(disposedSpy).toHaveBeenCalledWith(instance);
    });

    it('should handle native "ended" event listener logic', () => {
        instance.play();

        const onEndedCallback = mockContext._mockSourceNode.addEventListener.mock.calls[0][1];

        instance.stop();
        onEndedCallback();
        expect(instance.state).toBe('stopped');

        instance.play();
        instance.pause();
        const onEndedCallback2 = mockContext._mockSourceNode.addEventListener.mock.calls[1][1];
        onEndedCallback2();
        expect(instance.state).toBe('paused');

        instance.play();
        const onEndedCallback3 = mockContext._mockSourceNode.addEventListener.mock.calls[2][1];
        onEndedCallback3();
        expect(instance.state).toBe('idle');
    });

    describe('SoundInstance - Spatial Audio (setPosition)', () => {
        let mockPanner: any;
        let mockContextManager: any;
        let mockNodeFactory: any;
        let soundInstance: SoundInstance;
        const CURRENT_TIME = 100.5;

        beforeEach(() => {
            vi.clearAllMocks();

            mockPanner = {
                positionX: { setTargetAtTime: vi.fn() },
                positionY: { setTargetAtTime: vi.fn() },
                positionZ: { setTargetAtTime: vi.fn() },
                pan: { value: 0 },
                connect: vi.fn(),
                disconnect: vi.fn()
            };

            mockContextManager = {
                context: { currentTime: CURRENT_TIME }
            };

            mockNodeFactory = {
                create3DPanner: vi.fn().mockReturnValue(mockPanner),
                createStereoPanner: vi.fn().mockReturnValue(mockPanner),
                createPanner: vi.fn().mockReturnValue(mockPanner),
                createGain: vi.fn().mockReturnValue({
                    connect: vi.fn(),
                    disconnect: vi.fn(),
                    gain: { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }
                }),
                createFilter: vi.fn().mockReturnValue({
                    connect: vi.fn(),
                    disconnect: vi.fn()
                })
            };

            soundInstance = new SoundInstance(
                'test_id' as SoundId,
                mockContextManager,
                mockNodeFactory,
                {} as AudioBuffer,
                {} as any,
                {
                    hasPanner: true,
                    spatial: { panningModel: 'HRTF' }
                }
            );
        });

        it('should safely exit if PannerNode is not present (2D sound)', () => {
            const soundInstance2D = new SoundInstance(
                'test_id_2d' as SoundId,
                mockContextManager,
                mockNodeFactory,
                {} as AudioBuffer,
                {} as any,
                {}
            );

            expect(() => soundInstance2D.setPosition(10, 20, 30)).not.toThrow();
        });

        describe('Ticker Spam Protection (Low-Pass Filter)', () => {
            it('should use setTargetAtTime with a 10ms timeConstant (tc = 0.01)', () => {
                soundInstance.setPosition(10, 20, 30);

                expect(mockPanner.positionX.setTargetAtTime).toHaveBeenCalledWith(10, CURRENT_TIME, 0.01);
                expect(mockPanner.positionY.setTargetAtTime).toHaveBeenCalledWith(20, CURRENT_TIME, 0.01);
                expect(mockPanner.positionZ.setTargetAtTime).toHaveBeenCalledWith(30, CURRENT_TIME, 0.01);
            });
        });

        describe('Singularity Protection (Zero-Crossing Sign Preservation)', () => {
            it('should clamp absolute zero (0, 0, 0) to z = +0.1', () => {
                soundInstance.setPosition(0, 0, 0);

                expect(mockPanner.positionX.setTargetAtTime).toHaveBeenCalledWith(0, CURRENT_TIME, 0.01);
                expect(mockPanner.positionY.setTargetAtTime).toHaveBeenCalledWith(0, CURRENT_TIME, 0.01);
                expect(mockPanner.positionZ.setTargetAtTime).toHaveBeenCalledWith(0.1, CURRENT_TIME, 0.01);
            });

            it('should preserve negative sign when approaching zero (e.g., z = -0.05 becomes -0.1)', () => {
                soundInstance.setPosition(10, 10, -0.05);
                expect(mockPanner.positionZ.setTargetAtTime).toHaveBeenCalledWith(-0.1, CURRENT_TIME, 0.01);
            });

            it('should preserve positive sign when approaching zero (e.g., z = 0.05 becomes 0.1)', () => {
                soundInstance.setPosition(10, 10, 0.05);
                expect(mockPanner.positionZ.setTargetAtTime).toHaveBeenCalledWith(0.1, CURRENT_TIME, 0.01);
            });

            it('should NOT clamp coordinates if they are outside the 0.1 danger zone', () => {
                soundInstance.setPosition(0, 0, -0.15);
                expect(mockPanner.positionZ.setTargetAtTime).toHaveBeenCalledWith(-0.15, CURRENT_TIME, 0.01);

                soundInstance.setPosition(0, 0, 0.2);
                expect(mockPanner.positionZ.setTargetAtTime).toHaveBeenCalledWith(0.2, CURRENT_TIME, 0.01);
            });
        });
    });
});

describe('SoundInstance Rebinding Lifecycle', () => {
    let mockContextManager: any;
    let nodeFactory: AudioNodeFactory;
    let automation: AutomationEngine;
    let mockBuffer: AudioBuffer;

    beforeEach(() => {
        const createMockAudioParameter = () => ({
            value: 0,
            setValueAtTime: vi.fn(),
            setTargetAtTime: vi.fn(),
            cancelScheduledValues: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn()
        });

        const mockPanner = {
            positionX: createMockAudioParameter(),
            positionY: createMockAudioParameter(),
            positionZ: createMockAudioParameter(),
            distanceModel: 'linear',
            refDistance: 1,
            maxDistance: 10_000,
            connect: vi.fn(),
            disconnect: vi.fn()
        };

        mockContextManager = {
            context: {
                createGain: vi.fn().mockImplementation(() => ({
                    gain: createMockAudioParameter(),
                    connect: vi.fn(),
                    disconnect: vi.fn()
                })),
                createPanner: vi.fn().mockReturnValue(mockPanner),
                createBiquadFilter: vi.fn().mockImplementation(() => ({
                    type: '',
                    frequency: createMockAudioParameter(),
                    Q: createMockAudioParameter(),
                    gain: createMockAudioParameter(),
                    connect: vi.fn(),
                    disconnect: vi.fn()
                })),
                currentTime: 0
            }
        };

        nodeFactory = new AudioNodeFactory(mockContextManager as any);
        automation = { ramp: vi.fn() } as unknown as AutomationEngine;
        mockBuffer = {} as AudioBuffer;
    });

    it('Pre-allocated pool instance should acquire spatial properties on rebind', () => {
        const instance = new SoundInstance(
            '__RESERVED__' as SoundId,
            mockContextManager,
            nodeFactory,
            null,
            automation,
            {}
        );

        expect(instance.pannerNode).toBeNull();

        instance.rebind('explosion' as SoundId, mockBuffer, {
            spatial: { distanceModel: 'linear', refDistance: 1, maxDistance: 1000 }
        });

        instance.setPosition(10, 20, 30);

        expect(instance.pannerNode).not.toBeNull();
        expect((instance.pannerNode as any).distanceModel).toBe('linear');
    });
});
