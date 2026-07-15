/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioContext as MockAudioContext, registrar } from 'standardized-audio-context-mock';

import { AudioNodeFactory } from '@infrastructure/nodes/AudioNodeFactory.js';
import { NodeChain } from '@infrastructure/nodes/NodeChain.js';

import { SoundInstance } from '../SoundInstance.js';

import type AudioContextManager from '../../context/AudioContextManager.js';
import type { AudioCtx } from '@infrastructure/types/IAudioContext.js';
import type { SoundId } from '@scene-grid/shared';
import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';

function setupStandardizedContext() {
    const realMockContext = new MockAudioContext();
    const mockContext = realMockContext as unknown as AudioCtx;

    const createdSources: any[] = [];
    const createdGains: any[] = [];
    const createdPanners: any[] = [];

    const origCreateSource = mockContext.createBufferSource.bind(mockContext);
    mockContext.createBufferSource = () => {
        const node = origCreateSource();
        vi.spyOn(node, 'start');
        vi.spyOn(node, 'stop');
        vi.spyOn(node, 'disconnect');
        vi.spyOn(node, 'connect');
        vi.spyOn(node, 'addEventListener');
        vi.spyOn(node, 'removeEventListener');
        createdSources.push(node);
        return node as any;
    };

    const origCreateGain = mockContext.createGain.bind(mockContext);
    mockContext.createGain = () => {
        const node = origCreateGain();
        vi.spyOn(node.gain, 'setValueAtTime');
        vi.spyOn(node.gain, 'setTargetAtTime');
        vi.spyOn(node.gain, 'cancelScheduledValues');
        vi.spyOn(node.gain, 'linearRampToValueAtTime');
        vi.spyOn(node.gain, 'exponentialRampToValueAtTime');
        vi.spyOn(node, 'connect');
        vi.spyOn(node, 'disconnect');
        createdGains.push(node);
        return node as any;
    };

    const origCreatePanner = mockContext.createPanner.bind(mockContext);
    mockContext.createPanner = () => {
        const node = origCreatePanner();
        vi.spyOn(node.positionX, 'setTargetAtTime');
        vi.spyOn(node.positionY, 'setTargetAtTime');
        vi.spyOn(node.positionZ, 'setTargetAtTime');

        let dm = 'inverse';
        Object.defineProperty(node, 'distanceModel', {
            get: () => dm,
            set: val => {
                dm = val;
            }
        });

        createdPanners.push(node);
        return node as any;
    };

    const setTime = (time: number) => {
        vi.spyOn(mockContext as any, 'currentTime', 'get').mockReturnValue(time);
    };

    return { realMockContext, mockContext, setTime, createdSources, createdGains, createdPanners };
}

describe('SoundInstance (Playback & Virtualization Math)', () => {
    let env: ReturnType<typeof setupStandardizedContext>;
    let mockContextManager: AudioContextManager;
    let mockFactory: AudioNodeFactory;
    let mockBuffer: AudioBuffer;
    let mockAutomation: AutomationEngine;
    let instance: SoundInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        env = setupStandardizedContext();

        mockContextManager = {
            context: env.mockContext,
            resume: vi.fn()
        } as unknown as AudioContextManager;

        mockFactory = {
            createGain: () => env.mockContext.createGain(),
            createStereoPanner: () => env.mockContext.createStereoPanner(),
            createFilter: () => env.mockContext.createBiquadFilter(),
            create3DPanner: () => env.mockContext.createPanner()
        } as unknown as AudioNodeFactory;

        mockBuffer = env.realMockContext.createBuffer(2, 441000, 44100) as unknown as AudioBuffer;

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

    afterEach(() => {
        registrar.reset(env.mockContext as any);
    });

    it('should correctly initialize and play', () => {
        expect(instance.state).toBe('idle');
        instance.play();

        const source = env.createdSources[0];
        expect(source.start).toHaveBeenCalledWith(0, 0, undefined);
        expect(instance.state).toBe('playing');
        expect(source.connect).toHaveBeenCalled();
    });

    it('should execute Click-free Stop (Micro-fade) and emit events', () => {
        const endedSpy = vi.fn();
        const stoppedSpy = vi.fn();

        instance.on('ended', endedSpy);
        instance.on('stopped', stoppedSpy);

        instance.play();
        const source = env.createdSources[0];
        const gain = instance.gainParam as any;

        instance.stop();

        expect(gain.cancelScheduledValues).toHaveBeenCalledWith(0);
        expect(gain.setTargetAtTime).toHaveBeenCalledWith(0, 0, 0.005);
        expect(source.stop).toHaveBeenCalledWith(0.015);

        expect(instance.state).toBe('stopped');
        expect(stoppedSpy).toHaveBeenCalledTimes(1);
        expect(endedSpy).toHaveBeenCalledTimes(1);
    });

    it('should correctly calculate currentTime during playback', () => {
        instance.play();

        env.setTime(3.5);
        expect(instance.currentTime).toBe(3.5);

        env.setTime(12);
        expect(instance.currentTime).toBe(2);
    });

    it('should completely destroy hardware node on virtualize()', () => {
        instance.play();
        const source = env.createdSources[0];

        instance.virtualize();

        expect(instance.state).toBe('virtual');
        expect(source.disconnect).toHaveBeenCalled();
        expect(source.stop).toHaveBeenCalled();
    });

    it('should preserve synchronization on devirtualize() (Play from elapsed time)', () => {
        instance.play();
        env.setTime(2);
        instance.virtualize();

        env.setTime(7);
        instance.devirtualize();

        const newSource = env.createdSources[1];
        expect(newSource.start).toHaveBeenCalledWith(7.05, 7.05);
        expect(instance.state).toBe('playing');
    });

    it('should correctly handle loop math during devirtualize()', () => {
        instance.play();
        instance.virtualize();

        env.setTime(24);
        instance.devirtualize();

        const newSource = env.createdSources[1];
        expect(newSource.start).toHaveBeenCalledWith(24.05, 4.050000000000001);
    });
});

describe('SoundInstance (Pause, Resume & Parameters)', () => {
    let env: ReturnType<typeof setupStandardizedContext>;
    let mockContextManager: AudioContextManager;
    let mockFactory: AudioNodeFactory;
    let mockBuffer: AudioBuffer;
    let mockAutomation: AutomationEngine;
    let instance: SoundInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        env = setupStandardizedContext();

        mockContextManager = {
            context: env.mockContext,
            resume: vi.fn()
        } as unknown as AudioContextManager;

        mockFactory = {
            createGain: () => env.mockContext.createGain(),
            createPanner: () => env.mockContext.createPanner()
        } as unknown as AudioNodeFactory;

        mockBuffer = env.realMockContext.createBuffer(2, 441000, 44100) as unknown as AudioBuffer;

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

    afterEach(() => {
        registrar.reset(env.mockContext as any);
    });

    it('should correctly PAUSE and RESUME playback, keeping track of time', () => {
        instance.play();
        const source1 = env.createdSources[0];

        env.setTime(3);
        instance.pause();

        expect(instance.state).toBe('paused');
        expect(source1.stop).toHaveBeenCalled();

        env.setTime(8);
        instance.resume();

        const source2 = env.createdSources[1];
        expect(instance.state).toBe('playing');
        expect(source2.start).toHaveBeenCalledWith(8, 3);
    });

    it('should ignore pause() if already paused or idle', () => {
        instance.pause();
        expect(instance.state).toBe('idle');

        instance.play();
        instance.pause();
        expect(instance.state).toBe('paused');

        const source = env.createdSources[0];
        source.stop.mockClear();

        instance.pause();
        expect(source.stop).not.toHaveBeenCalled();
    });

    it('should dynamically update playbackRate (Pitch/Speed)', () => {
        instance.setRate(1.5);
        instance.play();
        const source = env.createdSources[0];

        expect(source.playbackRate.value).toBe(1.5);

        instance.setRate(0.8);
        expect(source.playbackRate.value).toBe(0.8);
    });

    it('should dynamically update loop state', () => {
        instance.setLoop(true);
        instance.play();
        const source = env.createdSources[0];

        expect(source.loop).toBe(true);

        instance.setLoop(false);
        expect(source.loop).toBe(false);
    });

    it('should clear all event listeners on resetForReuse()', () => {
        const spy = vi.fn();
        instance.on('ended', spy);

        instance.play();
        const source = env.createdSources[0];

        instance.resetForReuse();

        const onEndedCall = source.addEventListener.mock.calls.find((call: any) => call[0] === 'ended');
        if (onEndedCall) onEndedCall[1]();

        expect(spy).not.toHaveBeenCalled();
    });
});

describe('SoundInstance (Coverage & Edge Cases)', () => {
    let env: ReturnType<typeof setupStandardizedContext>;
    let mockContextManager: AudioContextManager;
    let mockFactory: AudioNodeFactory;
    let mockBuffer: AudioBuffer;
    let mockAutomation: AutomationEngine;
    let instance: SoundInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        env = setupStandardizedContext();
        mockContextManager = { context: env.mockContext } as unknown as AudioContextManager;

        mockFactory = {
            createGain: () => env.mockContext.createGain(),
            createStereoPanner: () => env.mockContext.createStereoPanner(),
            createFilter: () => env.mockContext.createBiquadFilter(),
            createPanner: () => env.mockContext.createPanner(),
            create3DPanner: () => env.mockContext.createPanner()
        } as unknown as AudioNodeFactory;

        mockBuffer = env.realMockContext.createBuffer(2, 441000, 44100) as unknown as AudioBuffer;
        mockAutomation = { ramp: vi.fn() } as unknown as AutomationEngine;

        instance = new SoundInstance('test' as SoundId, mockContextManager, mockFactory, mockBuffer, mockAutomation, {
            hasPanner: true
        });
    });

    afterEach(() => {
        registrar.reset(env.mockContext as any);
    });

    it('should handle routing delegation to NodeChain correctly', () => {
        const connectSpy = vi.spyOn(NodeChain.prototype, 'connectTo').mockImplementation(() => {});
        const disconnectSpy = vi.spyOn(NodeChain.prototype, 'disconnect').mockImplementation(() => {});

        const mockDestination = {} as any;

        instance.connectTo(mockDestination);
        expect(connectSpy).toHaveBeenCalledWith(mockDestination);

        instance.disconnectRoute();
        expect(disconnectSpy).toHaveBeenCalled();

        connectSpy.mockRestore();
        disconnectSpy.mockRestore();
    });

    it('should handle getters correctly (gainParam, sidechainTriggerNode)', () => {
        expect(instance.gainParam).toBeDefined();
        expect(instance.sidechainTriggerNode).toBeDefined();
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
        expect(noBufferInstance.currentTime).toBe(0);

        expect(() => {
            noBufferInstance.play();
        }).not.toThrow();
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
        const source = env.createdSources[0];
        instance.stop(5);
        expect(source.stop).toHaveBeenCalled();

        instance.play();
        const source2 = env.createdSources[1];
        source2.stop.mockImplementationOnce(() => {
            throw new Error('WebAudio Error');
        });
        expect(() => {
            instance.stop(5);
        }).not.toThrow();

        instance.play();
        const source3 = env.createdSources[2];
        source3.stop.mockImplementationOnce(() => {
            throw new Error('WebAudio Error');
        });
        expect(() => {
            instance.stop();
        }).not.toThrow();
    });

    it('should handle cancelScheduled() edge cases', () => {
        expect(() => {
            instance.cancelScheduled();
        }).not.toThrow();

        instance.play();
        const source = env.createdSources[0];
        instance.cancelScheduled();

        expect(instance.state).toBe('stopped');
        expect(source.removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function));

        instance.play();
        const source2 = env.createdSources[1];
        source2.stop.mockImplementationOnce(() => {
            throw new Error('Stop Error');
        });

        const gainParam = instance.gainParam as any;
        gainParam.cancelScheduledValues.mockImplementationOnce(() => {
            throw new Error('Gain Error');
        });

        expect(() => {
            instance.cancelScheduled();
        }).not.toThrow();
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
        expect(env.createdSources.length).toBe(0);

        preAllocated.rebind('real_sound' as SoundId, mockBuffer);
        expect(preAllocated.duration).toBe(10);

        preAllocated.play();
        expect(env.createdSources.length).toBe(1);
        expect(preAllocated.state).toBe('playing');
    });

    it('should execute dispose() correctly', () => {
        instance.play();
        // oxlint-disable-next-line no-unused-vars
        const source = env.createdSources[0];
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
        const source1 = env.createdSources[0];
        const onEnded1 = source1.addEventListener.mock.calls.find((c: any) => c[0] === 'ended')[1];

        instance.stop();
        onEnded1();
        expect(instance.state).toBe('stopped');

        instance.play();
        instance.pause();
        const source2 = env.createdSources[1];
        const onEnded2 = source2.addEventListener.mock.calls.find((c: any) => c[0] === 'ended')[1];
        onEnded2();
        expect(instance.state).toBe('paused');

        instance.play();
        const source3 = env.createdSources[2];
        const onEnded3 = source3.addEventListener.mock.calls.find((c: any) => c[0] === 'ended')[1];
        onEnded3();
        expect(instance.state).toBe('idle');
    });

    it('should return pauseOffset when currentTime is accessed while paused (Line 98)', () => {
        instance.play();
        env.setTime(2.5);
        instance.pause();

        expect(instance.currentTime).toBe(2.5);
    });

    it('should forcefully stop playback if rebind is called on a playing or virtual instance (Line 114)', () => {
        instance.play();
        const stopSpy = vi.spyOn(instance, 'stop');

        instance.rebind('new_id_1' as SoundId, mockBuffer);
        expect(stopSpy).toHaveBeenCalledWith(0);

        instance.play();
        instance.virtualize();
        instance.rebind('new_id_2' as SoundId, mockBuffer);
        expect(stopSpy).toHaveBeenCalledWith(0);
    });

    it('should change state to stopped in cancelScheduled if instance was paused', () => {
        instance.play();
        instance.pause();

        instance.cancelScheduled();
        expect(instance.state).toBe('stopped');
    });

    it('should early return in devirtualize if state is not virtual or buffer is missing (Line 303)', () => {
        instance.play();
        instance.devirtualize();
        expect(instance.state).toBe('playing');

        const emptyInstance = new SoundInstance(
            'empty' as SoundId,
            mockContextManager,
            mockFactory,
            null,
            mockAutomation
        );
        (emptyInstance as any)['#state'] = 'virtual';
        emptyInstance.devirtualize();
    });

    it('should reset position if pannerNode exists during resetForReuse (Line 319)', () => {
        const pannerInstance = new SoundInstance(
            'pan_id' as SoundId,
            mockContextManager,
            mockFactory,
            mockBuffer,
            mockAutomation,
            { hasPanner: true }
        );
        const setPosSpy = vi.spyOn(pannerInstance, 'setPosition');

        pannerInstance.resetForReuse();
        expect(setPosSpy).toHaveBeenCalledWith(0, 0, 0);
    });

    it('should ignore onSourceEnded native callback if state is virtual or not playing (Line 343)', () => {
        instance.play();
        const source = env.createdSources[0];
        const onEndedCallback = source.addEventListener.mock.calls.find((c: any) => c[0] === 'ended')[1];

        instance.virtualize();
        onEndedCallback();
        expect(instance.state).toBe('virtual');

        instance.devirtualize();
        instance.pause();
        onEndedCallback();
        expect(instance.state).toBe('paused');
    });

    it('should safely ignore automate targets if specific nodes lack properties (Line 387)', () => {
        const pannerSpy = vi.spyOn(NodeChain.prototype, 'pannerNode', 'get').mockReturnValue({} as any);
        expect(() => {
            instance.automate('pan', 1);
        }).not.toThrow();
        pannerSpy.mockRestore();

        const filterSpy = vi.spyOn(NodeChain.prototype, 'mainFilterNode', 'get').mockReturnValue({} as any);
        expect(() => {
            instance.automate('filterFrequency', 2000);
        }).not.toThrow();
        filterSpy.mockRestore();
    });

    it('should early return in resume() if state is not paused or buffer is missing', () => {
        expect(instance.state).toBe('idle');
        instance.resume();
        expect(env.createdSources.length).toBe(0);

        instance.play();
        instance.pause();

        instance.rebind('empty_id' as SoundId, null as any);
        instance.resume();

        expect(instance.state).toBe('paused');
    });

    it('should early return in virtualize() if state is not playing', () => {
        instance.virtualize();
        expect(instance.state).toBe('idle');
    });

    describe('SoundInstance - Spatial Audio (setPosition)', () => {
        let spatialInstance: SoundInstance;

        beforeEach(() => {
            spatialInstance = new SoundInstance(
                'test_id' as SoundId,
                mockContextManager,
                mockFactory,
                mockBuffer,
                mockAutomation,
                {
                    hasPanner: true,
                    spatial: { panningModel: 'HRTF' } as any
                }
            );
            env.setTime(100.5);
        });

        it('should safely exit if PannerNode is not present (2D sound)', () => {
            const soundInstance2D = new SoundInstance(
                'test_id_2d' as SoundId,
                mockContextManager,
                mockFactory,
                mockBuffer,
                mockAutomation,
                {}
            );
            expect(() => {
                soundInstance2D.setPosition(10, 20, 30);
            }).not.toThrow();
        });

        describe('Ticker Spam Protection (Low-Pass Filter)', () => {
            it('should use setTargetAtTime with a 10ms timeConstant (tc = 0.01)', () => {
                const panner = spatialInstance.pannerNode as any;

                spatialInstance.setPosition(10, 20, 30);

                expect(panner.positionX.setTargetAtTime).toHaveBeenCalledWith(10, 100.5, 0.01);
                expect(panner.positionY.setTargetAtTime).toHaveBeenCalledWith(20, 100.5, 0.01);
                expect(panner.positionZ.setTargetAtTime).toHaveBeenCalledWith(30, 100.5, 0.01);
            });
        });

        describe('Singularity Protection (Zero-Crossing Sign Preservation)', () => {
            it('should clamp absolute zero (0, 0, 0) to z = +0.1', () => {
                const panner = spatialInstance.pannerNode as any;
                spatialInstance.setPosition(0, 0, 0);

                expect(panner.positionX.setTargetAtTime).toHaveBeenCalledWith(0, 100.5, 0.01);
                expect(panner.positionY.setTargetAtTime).toHaveBeenCalledWith(0, 100.5, 0.01);
                expect(panner.positionZ.setTargetAtTime).toHaveBeenCalledWith(0.1, 100.5, 0.01);
            });

            it('should preserve negative sign when approaching zero (e.g., z = -0.05 becomes -0.1)', () => {
                const panner = spatialInstance.pannerNode as any;
                spatialInstance.setPosition(10, 10, -0.05);
                expect(panner.positionZ.setTargetAtTime).toHaveBeenCalledWith(-0.1, 100.5, 0.01);
            });

            it('should preserve positive sign when approaching zero (e.g., z = 0.05 becomes 0.1)', () => {
                const panner = spatialInstance.pannerNode as any;
                spatialInstance.setPosition(10, 10, 0.05);
                expect(panner.positionZ.setTargetAtTime).toHaveBeenCalledWith(0.1, 100.5, 0.01);
            });

            it('should NOT clamp coordinates if they are outside the 0.1 danger zone', () => {
                const panner = spatialInstance.pannerNode as any;
                spatialInstance.setPosition(0, 0, -0.15);
                expect(panner.positionZ.setTargetAtTime).toHaveBeenCalledWith(-0.15, 100.5, 0.01);

                spatialInstance.setPosition(0, 0, 0.2);
                expect(panner.positionZ.setTargetAtTime).toHaveBeenCalledWith(0.2, 100.5, 0.01);
            });
        });
    });
});

describe('SoundInstance Rebinding Lifecycle', () => {
    let env: ReturnType<typeof setupStandardizedContext>;
    let mockContextManager: any;
    let nodeFactory: AudioNodeFactory;
    let automation: AutomationEngine;
    let mockBuffer: AudioBuffer;

    beforeEach(() => {
        vi.clearAllMocks();
        env = setupStandardizedContext();

        mockContextManager = {
            context: env.mockContext
        };

        nodeFactory = new AudioNodeFactory(mockContextManager);
        automation = { ramp: vi.fn() } as unknown as AutomationEngine;
        mockBuffer = env.realMockContext.createBuffer(2, 441000, 44100) as unknown as AudioBuffer;
    });

    afterEach(() => {
        registrar.reset(env.mockContext as any);
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
        expect(instance.id).toBe('__RESERVED__');

        instance.rebind('explosion' as SoundId, mockBuffer, {
            spatial: { distanceModel: 'linear', refDistance: 1, maxDistance: 1000 } as any
        });

        instance.setPosition(10, 20, 30);

        expect(instance.pannerNode).not.toBeNull();
        expect((instance.pannerNode as any).distanceModel).toBe('linear');
        expect(instance.id).toBe('explosion');
    });
});

describe('SoundInstance Lifecycle and Pooling', () => {
    let env: ReturnType<typeof setupStandardizedContext>;
    let mockContextManager: any;
    let mockFactory: any;
    let mockAutomation: any;
    let mockBuffer: any;

    beforeEach(() => {
        env = setupStandardizedContext();

        mockContextManager = {
            context: env.mockContext
        };

        mockFactory = {
            createGain: () => env.mockContext.createGain(),
            createStereoPanner: () => env.mockContext.createStereoPanner(),
            createPanner: () => env.mockContext.createPanner(),
            createFilter: () => env.mockContext.createBiquadFilter(),
            create3DPanner: () => env.mockContext.createPanner()
        } as unknown as AudioNodeFactory;

        mockAutomation = {
            ramp: vi.fn()
        };

        mockBuffer = env.realMockContext.createBuffer(2, 441000, 44100) as unknown as AudioBuffer;
    });

    afterEach(() => {
        registrar.reset(env.mockContext as any);
    });

    const createInstance = () => {
        return new SoundInstance('sound-1' as any, mockContextManager, mockFactory, mockBuffer, mockAutomation);
    };

    const triggerSourceEnded = (sourceIndex: number = -1) => {
        const idx = sourceIndex === -1 ? env.createdSources.length - 1 : sourceIndex;
        const source = env.createdSources[idx];
        if (!source) return;

        const addedHandlers = source.addEventListener.mock.calls
            .filter((call: any[]) => call[0] === 'ended')
            .map((call: any[]) => call[1]);

        // oxlint-disable-next-line unicorn/prefer-set-has
        const removedHandlers = source.removeEventListener.mock.calls
            // oxlint-disable-next-line typescript/prefer-readonly-parameter-types
            .filter((call: any[]) => call[0] === 'ended')
            // oxlint-disable-next-line typescript/no-unsafe-return typescript/prefer-readonly-parameter-types
            .map((call: any[]) => call[1]);

        addedHandlers.forEach((handler: any) => {
            if (!removedHandlers.includes(handler)) handler();
        });
    };

    it('should transition to idle and emit ended on natural playback completion', () => {
        const instance = createInstance();
        const endedSpy = vi.fn();
        instance.on('ended', endedSpy);

        instance.play();
        expect(instance.state).toBe('playing');

        triggerSourceEnded();

        expect(instance.state).toBe('idle');
        expect(endedSpy).toHaveBeenCalledTimes(1);
        expect(endedSpy).toHaveBeenCalledWith(instance);
    });

    it('should transition to idle and emit ended when forceNaturalEnd is called from virtual state', () => {
        const instance = createInstance();
        const endedSpy = vi.fn();
        instance.on('ended', endedSpy);

        instance.play();
        instance.virtualize();
        expect(instance.state).toBe('virtual');

        instance.forceNaturalEnd();

        expect(instance.state).toBe('idle');
        expect(endedSpy).toHaveBeenCalledTimes(1);
    });

    it('should immediately transition to stopped and emit events on immediate stop', () => {
        const instance = createInstance();
        const stoppedSpy = vi.fn();
        const endedSpy = vi.fn();
        instance.on('stopped', stoppedSpy);
        instance.on('ended', endedSpy);

        instance.play();
        instance.stop(0);

        const source = env.createdSources[0];
        expect(instance.state).toBe('stopped');
        expect(source.stop).toHaveBeenCalled();
        expect(stoppedSpy).toHaveBeenCalledTimes(1);
        expect(endedSpy).toHaveBeenCalledTimes(1);

        triggerSourceEnded();

        expect(instance.state).toBe('stopped');
        expect(endedSpy).toHaveBeenCalledTimes(1);
    });

    it('should trigger events asynchronously on delayed stop', () => {
        const instance = createInstance();
        const stoppedSpy = vi.fn();
        const endedSpy = vi.fn();
        instance.on('stopped', stoppedSpy);
        instance.on('ended', endedSpy);

        instance.play();

        const stopTime = 105;
        instance.stop(stopTime);

        expect(instance.state).toBe('playing');
        expect(stoppedSpy).not.toHaveBeenCalled();
        expect(endedSpy).not.toHaveBeenCalled();

        const source = env.createdSources[0];
        expect(source.stop).toHaveBeenCalledWith(stopTime + 0.015);

        triggerSourceEnded();

        expect(instance.state).toBe('stopped');
        expect(stoppedSpy).toHaveBeenCalledTimes(1);
        expect(endedSpy).toHaveBeenCalledTimes(1);
    });

    it('should prevent ghost events when slot is reset during an active delayed stop', () => {
        const instance = createInstance();

        instance.play();
        instance.stop(110);

        instance.resetForReuse();

        expect(instance.state).toBe('idle');
        const oldSource = env.createdSources[0];
        expect(oldSource.removeEventListener).toHaveBeenCalled();

        instance.rebind('sound-2' as any, mockBuffer);
        instance.play();

        expect(instance.state).toBe('playing');

        triggerSourceEnded(0);

        expect(instance.state).toBe('playing');
    });

    it('should not throw and safely abort if canceled before natural end', () => {
        const instance = createInstance();
        instance.play();

        instance.cancelScheduled();

        expect(instance.state).toBe('stopped');
        const source = env.createdSources[0];
        expect(source.removeEventListener).toHaveBeenCalled();
        expect(source.stop).toHaveBeenCalledWith(0);
        expect(source.disconnect).toHaveBeenCalled();
    });
});
