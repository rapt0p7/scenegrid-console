// oxlint-disable unicorn/no-useless-undefined
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { BusId, ContextTime, Milliseconds, PlaybackId, Seconds, SoundId } from '@scene-grid/shared';

import { VirtualReason } from '@domain/Shared/Ports/ISoundController';
import { SoundInstance } from '@infrastructure';
import { SoundController } from '@infrastructure/loader/SoundController.js';
/* eslint-disable @typescript-eslint/naming-convention */
// oxlint-disable no-underscore-dangle
// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach, Mocked } from 'vitest';

describe('SoundController', () => {
    let mockPool: any;
    let mockScheduler: any;
    let mockContext: any;
    let mockAutomation: any;
    let mockBusSystem: any;
    let controller: SoundController;
    let fakeBuffer: AudioBuffer;
    let fakeInstance: any;
    let mockBufferResolver: ReturnType<typeof vi.fn>;
    let mockManifestResolver: ReturnType<typeof vi.fn>;
    let mockStreamFactory: ReturnType<typeof vi.fn>;
    let mockTelemetry: Mocked<ITelemetryDispatcher>;

    beforeEach(() => {
        vi.clearAllMocks();

        fakeBuffer = {} as AudioBuffer;

        fakeInstance = {
            _poolIndex: 5,
            setLoop: vi.fn(),
            setRate: vi.fn(),
            stop: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            virtualize: vi.fn(),
            devirtualize: vi.fn(),
            forceNaturalEnd: vi.fn(),
            setPosition: vi.fn(),
            cancelScheduled: vi.fn(),
            on: vi.fn().mockReturnValue(() => 'unsubscribed'),
            gainParam: { value: 1, cancelScheduledValues: vi.fn() },
            sidechainTriggerNode: {},
            connectTo: vi.fn(),
            disconnectRoute: vi.fn(),

            state: 'playing',
            isLooping: false,
            duration: 10,
            currentTime: 0,
            playbackRate: 1
        };

        mockPool = {
            acquire: vi.fn().mockReturnValue(fakeInstance),
            dispose: vi.fn(),
            globalVoiceLimit: 32,
            events: { on: vi.fn(), emit: vi.fn() }
        };

        mockScheduler = {
            schedulePlay: vi.fn()
        };

        mockContext = {
            currentTime: 123.45,
            sampleRate: 48_000
        };

        mockAutomation = {
            set: vi.fn(),
            ramp: vi.fn()
        };

        mockBusSystem = {
            getBus: vi.fn().mockReturnValue({ inputNode: {} }),
            addSidechainSource: vi.fn(),
            removeSidechainSource: vi.fn()
        };

        mockBufferResolver = vi.fn().mockReturnValue(fakeBuffer);
        mockManifestResolver = vi.fn().mockReturnValue(undefined);
        mockStreamFactory = vi.fn();

        mockTelemetry = {
            dispatch: vi.fn(),
            dispatchManifest: vi.fn()
        };

        controller = new SoundController(
            mockPool,
            mockScheduler,
            mockContext,
            mockAutomation,
            new Map() as any,
            mockBusSystem,
            mockBufferResolver as any,
            mockManifestResolver as any,
            mockStreamFactory as any,
            mockTelemetry
        );
    });

    describe('Registration', () => {
        it('should register a new sound with options only (No AudioBuffer)', () => {
            controller.register('sound_1' as SoundId, { url: 'path.wav' });

            const registry = (controller as any).registry;
            expect(registry.has('sound_1')).toBe(true);
            expect(registry.get('sound_1').options).toEqual({ url: 'path.wav' });
        });

        it('should not throw and not overwrite if registering an already existing sound', () => {
            controller.register('duplicate_sound' as SoundId, { url: 'first' });

            expect(() => {
                controller.register('duplicate_sound' as SoundId, { url: 'second' });
            }).not.toThrow();

            expect((controller as any).registry.get('duplicate_sound').options.url).toBe('first');
        });
    });

    describe('Unregistration', () => {
        it('should remove sound from registry and dispose from pool', () => {
            controller.register('sound_to_remove' as SoundId, { url: 'remove.wav' });
            controller.unregister('sound_to_remove' as SoundId);

            expect((controller as any).registry.has('sound_to_remove')).toBe(false);
            expect(mockPool.dispose).toHaveBeenCalledWith('sound_to_remove');
        });
    });

    describe('Playback (Dynamic Buffer Resolution)', () => {
        it('should return null if playing an unregistered sound', () => {
            const result = controller.play('unknown_sound' as SoundId, {});
            expect(result).toBeNull();
        });

        it('should return null if buffer resolver returns undefined (bank is unloaded)', () => {
            controller.register('unloaded_sound' as SoundId, { url: 'unloaded.wav' });

            // oxlint-disable-next-line unicorn/no-useless-undefined
            mockBufferResolver.mockReturnValueOnce(undefined);

            const result = controller.play('unloaded_sound' as SoundId, {});

            expect(mockBufferResolver).toHaveBeenCalledWith('unloaded.wav');
            expect(result).toBeNull();
            expect(mockPool.acquire).not.toHaveBeenCalled();
        });

        it('should resolve buffer dynamically, acquire instance, schedule play, and return PlaybackId', () => {
            controller.register('hero_jump' as SoundId, { url: 'jump.wav' });

            const playbackId = controller.play('hero_jump' as SoundId, {
                when: 0.5 as ContextTime,
                offset: 1.2 as Seconds,
                duration: 2 as Seconds,
                loop: true,
                rate: 1.5
            });

            expect(mockBufferResolver).toHaveBeenCalledWith('jump.wav');
            expect(mockPool.acquire).toHaveBeenCalledWith('hero_jump', fakeBuffer);
            expect(fakeInstance.setLoop).toHaveBeenCalledWith(true);
            expect(fakeInstance.setRate).toHaveBeenCalledWith(1.5);
            expect(mockScheduler.schedulePlay).toHaveBeenCalledWith(fakeInstance, 0.5, 1.2, 2);

            expect(typeof playbackId).toBe('number');
        });

        it('should skip playback if cooldown is set and did not pass', () => {
            controller.register('sound_limit' as SoundId, { url: 'path/to/sound.wav', cooldownMs: 30 });

            const id1 = controller.play('sound_limit' as SoundId, {});
            const id2 = controller.play('sound_limit' as SoundId, {});

            expect(typeof id1).toBe('number');
            expect(id2).toBeNull();
            expect(mockScheduler.schedulePlay).toHaveBeenCalledTimes(1);
        });

        it('should resolve manifest dynamically, create StreamInstance via factory, and skip pool acquire', () => {
            const mockManifest = { chunks: [], isLooping: false };
            const fakeStreamInstance = { ...fakeInstance };

            mockManifestResolver.mockReturnValueOnce(mockManifest);
            mockStreamFactory.mockReturnValueOnce(fakeStreamInstance);

            controller.register('ambient_stream' as SoundId, { url: 'stream.json' });

            const playbackId = controller.play('ambient_stream' as SoundId, {
                when: 1.0 as ContextTime,
                offset: 0 as Seconds,
                duration: 5 as Seconds,
                loop: false,
                rate: 1
            });

            expect(mockManifestResolver).toHaveBeenCalledWith('stream.json');
            expect(mockStreamFactory).toHaveBeenCalledWith(mockManifest);
            expect(mockBufferResolver).not.toHaveBeenCalled();
            expect(mockPool.acquire).not.toHaveBeenCalled();
            expect(fakeStreamInstance.setLoop).toHaveBeenCalledWith(false);
            expect(fakeStreamInstance.setRate).toHaveBeenCalledWith(1);
            expect(mockScheduler.schedulePlay).toHaveBeenCalledWith(fakeStreamInstance, 1.0, 0, 5);
            expect(fakeStreamInstance._poolIndex).toBe(-1);

            expect(typeof playbackId).toBe('number');
        });
    });

    describe('Playback Control (pause/resume)', () => {
        let nowSpy: any;
        let time = 0;
        let acquireSpy: any;

        beforeEach(() => {
            nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => {
                time += 100;
                return time;
            });

            controller.register('test_sound' as any, { url: 'dummy.wav', cooldownMs: 0 });
            controller.register('other_sound' as any, { url: 'dummy2.wav', cooldownMs: 0 });

            acquireSpy = vi.spyOn(controller.debugPool, 'acquire').mockImplementation(() => {
                const instance = {
                    state: 'playing',
                    pause: vi.fn(function (this: any) {
                        this.state = 'paused';
                    }),
                    resume: vi.fn(function (this: any) {
                        this.state = 'playing';
                    }),
                    virtualize: vi.fn(function (this: any) {
                        this.state = 'virtual';
                    }),
                    devirtualize: vi.fn(function (this: any) {
                        this.state = 'playing';
                    }),
                    stop: vi.fn(function (this: any) {
                        this.state = 'stopped';
                    }),
                    setLoop: vi.fn(),
                    setRate: vi.fn(),
                    on: vi.fn(),
                    off: vi.fn()
                };
                return instance as any;
            });
        });

        afterEach(() => {
            nowSpy.mockRestore();
            acquireSpy.mockRestore();
            time = 0;
        });

        it('should pause a specific instance by ID and handle virtual timer correctly', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            expect(id).not.toBeNull();

            const voice = controller.getLogicalVoice(id)!;
            const pauseSpy = vi.spyOn(voice.physicalInstance!, 'pause');

            controller.pauseById(id);
            expect(pauseSpy).toHaveBeenCalled();

            expect((controller as any).virtualTimers.find((t: any) => t.playbackId === id)).toBeUndefined();
        });

        it('should resume a specific instance by ID', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            const voice = controller.getLogicalVoice(id)!;
            const resumeSpy = vi.spyOn(voice.physicalInstance!, 'resume');

            controller.resumeById(id);
            expect(resumeSpy).toHaveBeenCalled();
        });

        it('should pause and resume all instances of a specific sound', () => {
            const id1 = controller.play('test_sound' as SoundId, {})!;
            const id2 = controller.play('test_sound' as SoundId, {})!;
            const id3 = controller.play('other_sound' as SoundId, {})!;

            const pauseSpy1 = vi.spyOn(controller.getLogicalVoice(id1)!.physicalInstance!, 'pause');
            const pauseSpy2 = vi.spyOn(controller.getLogicalVoice(id2)!.physicalInstance!, 'pause');
            const pauseSpy3 = vi.spyOn(controller.getLogicalVoice(id3)!.physicalInstance!, 'pause');

            controller.pauseAll('test_sound' as any);

            expect(pauseSpy1).toHaveBeenCalled();
            expect(pauseSpy2).toHaveBeenCalled();
            expect(pauseSpy3).not.toHaveBeenCalled();

            const resumeSpy1 = vi.spyOn(controller.getLogicalVoice(id1)!.physicalInstance!, 'resume');
            controller.resumeAll('test_sound' as any);
            expect(resumeSpy1).toHaveBeenCalled();
        });

        it('should pause and resume ALL instances if soundId is not provided', () => {
            const id1 = controller.play('test_sound' as SoundId, {})!;
            const id2 = controller.play('other_sound' as SoundId, {})!;

            const pauseSpy1 = vi.spyOn(controller.getLogicalVoice(id1)!.physicalInstance!, 'pause');
            const pauseSpy2 = vi.spyOn(controller.getLogicalVoice(id2)!.physicalInstance!, 'pause');

            controller.pauseAll();

            expect(pauseSpy1).toHaveBeenCalled();
            expect(pauseSpy2).toHaveBeenCalled();
        });

        it('should maintain paused state even if VoiceCullingArbiter attempts to virtualize/devirtualize (Ghost Play fix)', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            const voice = controller.getLogicalVoice(id)!;

            expect(voice.logicalState).toBe('playing');

            controller.pauseById(id);
            expect(voice.logicalState).toBe('paused');
            expect(voice.physicalInstance?.state).toBe('paused');

            controller.virtualize(id);

            expect(voice.logicalState).toBe('paused');
            expect(voice.physicalInstance?.state).toBe('paused');

            controller.devirtualize(id);

            expect(voice.logicalState).toBe('paused');
            expect(voice.physicalInstance?.state).toBe('paused');
        });
    });

    describe('Stopping & Resource Management', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '' });
            controller.register('other_sound' as SoundId, { url: '' });
        });

        it('should stop instance and clean up activeVoices on ended event', () => {
            const id = controller.play('test_sound' as SoundId, {})!;

            const endedCallback = fakeInstance.on.mock.calls.find((call: any[]) => call[0] === 'ended')[1];

            controller.stopById(id, 1.5 as ContextTime);
            expect(fakeInstance.stop).toHaveBeenCalledWith(1.5);

            endedCallback(fakeInstance);
            expect(controller.activeVoices.has(id)).toBe(false);
        });

        it('should stop all related instances when stopAll is called with soundId', () => {
            const stopSpy = vi.spyOn(controller, 'stopById');
            controller.play('test_sound' as SoundId, {});

            controller.stopAll('test_sound' as SoundId);
            expect(stopSpy).toHaveBeenCalled();
        });

        it('should clear all sounds via stopById when stopAll is called without arguments', () => {
            controller.play('test_sound' as SoundId, {});
            controller.play('other_sound' as SoundId, {});

            const stopSpy = vi.spyOn(controller, 'stopById');

            controller.stopAll();

            expect(stopSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('Automation & Hardware Control', () => {
        let playbackId: PlaybackId;

        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '' });
            playbackId = controller.play('test_sound' as SoundId, {}) as PlaybackId;
        });

        it('should delegate setVolume to AutomationEngine using gainParam', () => {
            controller.setVolume(playbackId, 0.75);
            expect(mockAutomation.set).toHaveBeenCalledWith(fakeInstance.gainParam, 0.75);
        });

        it('should return context time and sample rate', () => {
            expect(controller.getCurrentTime()).toBe(123.45);
            expect(controller.getSampleRate()).toBe(48_000);
        });

        it('should delegate onVoiceEnded to instance event emitter', () => {
            const mockCallback = vi.fn();
            const unsub = controller.onVoiceEnded(playbackId, mockCallback);

            expect(fakeInstance.on).toHaveBeenCalledWith('ended', mockCallback);
            expect(unsub()).toBe('unsubscribed');
        });
    });

    describe('Logical Voices Position', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '' });
        });

        it('should update logical position and physical instance position', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            controller.setPosition(id, 10, 20, 30);

            const voice = controller.getLogicalVoice(id);
            expect(voice?.position).toEqual({ x: 10, y: 20, z: 30 });
            expect(fakeInstance.setPosition).toHaveBeenCalledWith(10, 20, 30);
        });

        it('should return position coordinates or undefined if voice is missing', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            controller.setPosition(id, 5, 15, 25);

            expect(controller.getPosition(id)).toEqual({ x: 5, y: 15, z: 25 });

            expect(controller.getPosition(999 as PlaybackId)).toBeUndefined();
        });
    });

    describe('Routing & Bus Integration (Inversion of Control)', () => {
        let playbackId: PlaybackId;

        beforeEach(() => {
            controller.register('route_sound' as SoundId, { url: '' });
            playbackId = controller.play('route_sound' as SoundId, {}) as PlaybackId;
        });

        it('should instruct instance to connectTo the requested bus inputNode', () => {
            const mockBusInput = {};
            mockBusSystem.getBus.mockReturnValueOnce({ inputNode: mockBusInput });

            controller.routeToBus(playbackId, 'music' as BusId);

            expect(mockBusSystem.getBus).toHaveBeenCalledWith('music');
            expect(fakeInstance.connectTo).toHaveBeenCalledWith(mockBusInput);
        });

        it('should safely ignore routeToBus if voice or bus is missing', () => {
            // oxlint-disable-next-line unicorn/no-useless-undefined
            mockBusSystem.getBus.mockReturnValueOnce(undefined);
            expect(() => {
                controller.routeToBus(playbackId, 'missing_bus' as BusId);
            }).not.toThrow();

            expect(() => {
                controller.routeToBus(999 as PlaybackId, 'sfx' as BusId);
            }).not.toThrow();
        });

        it('should delegate addSidechainTrigger using sidechainTriggerNode', () => {
            controller.addSidechainTrigger(playbackId, 'ducked' as BusId, 0.8);

            expect(mockBusSystem.addSidechainSource).toHaveBeenCalledWith(
                fakeInstance.sidechainTriggerNode,
                'ducked',
                0.8
            );
        });

        it('should delegate removeSidechainTrigger using sidechainTriggerNode', () => {
            controller.removeSidechainTrigger(playbackId, 'ducked' as BusId);

            expect(mockBusSystem.removeSidechainSource).toHaveBeenCalledWith(
                fakeInstance.sidechainTriggerNode,
                'ducked'
            );
        });

        it('should automatically clear ALL sidechain triggers when instance is released back to pool', () => {
            controller.addSidechainTrigger(playbackId, 'ducked' as BusId, 0.8);
            controller.addSidechainTrigger(playbackId, 'ambience' as BusId, 0.5);

            const releasedHandler = mockPool.events.on.mock.calls.find((call: any[]) => call[0] === 'released')[1];
            expect(releasedHandler).toBeDefined();

            releasedHandler(fakeInstance);

            expect(mockBusSystem.removeSidechainSource).toHaveBeenCalledWith(
                fakeInstance.sidechainTriggerNode,
                'ducked'
            );
            expect(mockBusSystem.removeSidechainSource).toHaveBeenCalledWith(
                fakeInstance.sidechainTriggerNode,
                'ambience'
            );
        });
    });

    describe('Missing Coverage & Edge Cases (API & Virtualization)', () => {
        let playbackId: PlaybackId;

        beforeEach(() => {
            fakeInstance.virtualize = vi.fn();
            fakeInstance.devirtualize = vi.fn();
            fakeInstance.automate = vi.fn();
            fakeInstance.isLooping = false;
            fakeInstance.duration = 10;
            fakeInstance.currentTime = 0;
            fakeInstance.playbackRate = 1;

            controller.register('test_sound' as SoundId, { url: '' });
            playbackId = controller.play('test_sound' as SoundId, {}) as PlaybackId;
        });

        it('should return null from play() and dispatch telemetry if pool rejects the request', () => {
            mockPool.acquire.mockReturnValueOnce('MAX_POLYPHONY');

            controller.register('failed_sound' as SoundId, { url: '' });
            const result = controller.play('failed_sound' as SoundId, {});

            expect(result).toBeNull();

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'CAUSE_CHAIN',
                    result: expect.objectContaining({
                        type: 'BLOCKED',
                        reason: expect.stringContaining('MAX_POLYPHONY')
                    })
                })
            );
        });

        it('should early return in setPosition if voice does not exist', () => {
            expect(() => {
                controller.setPosition(999 as PlaybackId, 0, 0, 0);
            }).not.toThrow();
        });

        it('should correctly return active playbacks and resolve sound ids', () => {
            const active = controller.getActivePlaybacks();
            expect(active).toEqual([playbackId]);

            expect(controller.getSoundId(playbackId)).toBe('test_sound');
            expect(controller.getSoundId(999 as PlaybackId)).toBeUndefined();
        });

        it('should correctly resolve playback states', () => {
            expect(controller.getPlaybackState(playbackId)).toBe('playing');
            expect(controller.getPlaybackState(999 as PlaybackId)).toBe('stopped');

            const voice = controller.getLogicalVoice(playbackId);
            (voice as any).physicalInstance = null;
            expect(controller.getPlaybackState(playbackId)).toBe('stopped');
        });

        it('should handle virtualize() safely', () => {
            controller.virtualize(playbackId);
            expect(fakeInstance.virtualize).toHaveBeenCalled();
            expect(() => {
                controller.virtualize(999 as PlaybackId);
            }).not.toThrow();
        });

        it('should handle devirtualize() and trigger onRevive correctly', () => {
            const reviveSpy = vi.fn();
            controller.register('revive_sound' as SoundId, { url: '' });
            const revivableId = controller.play('revive_sound' as SoundId, { onRevive: reviveSpy }) as PlaybackId;

            controller.devirtualize(revivableId);
            expect(fakeInstance.devirtualize).toHaveBeenCalled();
            expect(reviveSpy).toHaveBeenCalledWith(revivableId);

            expect(() => {
                controller.devirtualize(999 as PlaybackId);
            }).not.toThrow();
        });

        it('should format arguments and delegate fadeVolume() correctly using gainParam', () => {
            controller.fadeVolume(playbackId, 0.5, 1000 as Milliseconds, 'equal-power', 100 as Milliseconds);

            expect(mockAutomation.ramp).toHaveBeenCalledWith(fakeInstance.gainParam, 0.5, 1000, 'equal-power', 100);

            expect(() => {
                controller.fadeVolume(999 as PlaybackId, 1, 1 as Milliseconds);
            }).not.toThrow();
        });

        it('should delegate fadeParameter() correctly', () => {
            controller.fadeParameter(playbackId, 'filterFrequency', 2000, 500 as Milliseconds);

            expect(fakeInstance.automate).toHaveBeenCalledWith('filterFrequency', 2000, 500);

            expect(() => {
                controller.fadeParameter(999 as PlaybackId, 'pitch', 1, 1 as Milliseconds);
            }).not.toThrow();
        });

        it('should delegate cancelScheduled() correctly', () => {
            controller.cancelScheduled(playbackId);
            expect(fakeInstance.cancelScheduled).toHaveBeenCalled();

            expect(() => {
                controller.cancelScheduled(999 as PlaybackId);
            }).not.toThrow();
        });

        it('should return a dummy unsubscribe function for onVoiceEnded if voice is missing', () => {
            const dummyUnsub = controller.onVoiceEnded(999 as PlaybackId, vi.fn());

            expect(() => {
                dummyUnsub();
            }).not.toThrow();
        });

        it('should remove sidechain trigger on virtualize and restore it on devirtualize', () => {
            controller.addSidechainTrigger(playbackId, 'ducked' as BusId, 0.75);
            mockBusSystem.removeSidechainSource.mockClear();
            mockBusSystem.addSidechainSource.mockClear();

            controller.virtualize(playbackId);

            expect(mockBusSystem.removeSidechainSource).toHaveBeenCalledWith(
                fakeInstance.sidechainTriggerNode,
                'ducked'
            );

            controller.devirtualize(playbackId);

            expect(mockBusSystem.addSidechainSource).toHaveBeenCalledWith(
                fakeInstance.sidechainTriggerNode,
                'ducked',
                0.75
            );
        });

        it('should correctly remove a timer from the virtual queue using swap-and-pop (O(1) deletion)', () => {
            controller.register('swap_sound' as SoundId, { url: '', cooldownMs: 0 });

            const fakeInstance1 = { ...fakeInstance };
            const fakeInstance2 = { ...fakeInstance };

            mockPool.acquire.mockReturnValueOnce(fakeInstance1).mockReturnValueOnce(fakeInstance2);

            const id1 = controller.play('swap_sound' as SoundId, {}) as PlaybackId;
            const id2 = controller.play('swap_sound' as SoundId, {}) as PlaybackId;

            expect(id1).not.toBeNull();
            expect(id2).not.toBeNull();

            controller.virtualize(id1);
            controller.virtualize(id2);

            const timers = (controller as any).virtualTimers;
            expect(timers).toHaveLength(2);

            const firstAdded = timers[0].playbackId;
            const secondAdded = timers[1].playbackId;

            controller.devirtualize(firstAdded);

            expect(timers).toHaveLength(1);
            expect(timers[0].playbackId).toBe(secondAdded);
        });

        it('should remove timer from virtual queue via handleVoiceEnded if stopped while virtual', () => {
            controller.register('end_sound' as SoundId, { url: '', cooldownMs: 0 });

            const fakeInst = { ...fakeInstance };
            mockPool.acquire.mockReturnValueOnce(fakeInst);

            const id = controller.play('end_sound' as SoundId, {}) as PlaybackId;
            expect(id).not.toBeNull();

            controller.virtualize(id);

            const timers = (controller as any).virtualTimers;
            expect(timers).toHaveLength(1);

            const endedCallback = fakeInst.on.mock.calls.find((call: any[]) => call[0] === 'ended')[1];

            fakeInst._currentPlaybackId = id;
            endedCallback(fakeInst);

            expect(timers).toHaveLength(0);
        });
    });

    describe('Virtual Nodes (Scatterer Support)', () => {
        it('should create a ghost voice WITHOUT a physical instance or registry entry', () => {
            const id = controller.playVirtual('unregistered_ghost' as SoundId);

            expect(id).toBeDefined();
            expect(typeof id).toBe('number');

            const voice = controller.getLogicalVoice(id)!;
            expect(voice.physicalInstance).toBeNull();
            expect((voice as any).isVirtualNode).toBe(true);
            expect(voice.soundId).toBe('unregistered_ghost');
        });

        it('should silently remove virtual voice on stopById without throwing', () => {
            const id = controller.playVirtual('virtual_mock' as SoundId);

            expect(() => {
                controller.stopById(id);
            }).not.toThrow();

            expect(controller.activeVoices.has(id)).toBe(false);
        });

        it('should update logical state on pause/resume but not crash on physical operations', () => {
            const id = controller.playVirtual('virtual_mock' as SoundId);

            expect(() => {
                controller.pauseById(id);
            }).not.toThrow();
            expect(controller.getLogicalState(id)).toBe('paused');

            expect(() => {
                controller.resumeById(id);
            }).not.toThrow();
            expect(controller.getLogicalState(id)).toBe('playing');
        });

        it('should safely ignore hardware/physical methods', () => {
            const id = controller.playVirtual('virtual_mock' as SoundId);

            expect(() => {
                controller.setPosition(id, 10, 20, 30);
                controller.setVolume(id, 0.5);
                controller.fadeVolume(id, 1, 100 as Milliseconds);
                controller.fadeParameter(id, 'pitch', 2, 100 as Milliseconds);
                controller.routeToBus(id, 'sfx' as BusId);
                controller.addSidechainTrigger(id, 'music' as BusId, 1);
                controller.virtualize(id);
                controller.devirtualize(id);
            }).not.toThrow();

            const voice = controller.getLogicalVoice(id)!;
            expect(voice.position).toEqual({ x: 10, y: 20, z: 30 });
        });

        it('should resolve state getters correctly for ghost voices', () => {
            const id = controller.playVirtual('virtual_mock' as SoundId);

            expect(controller.getLogicalState(id)).toBe('playing');

            expect(controller.getPlaybackState(id)).toBe('stopped');
        });

        it('should correctly identify ghost voices and ignore physical or missing voices', () => {
            controller.register('physical_mock' as SoundId, { url: '' });
            const physicalId = controller.play('physical_mock' as SoundId, {})!;

            const ghostId = controller.playVirtual('ghost_mock' as SoundId);

            expect(controller.isGhostVoice(ghostId)).toBe(true);
            expect(controller.isGhostVoice(physicalId)).toBe(false);
            expect(controller.isGhostVoice(999 as PlaybackId)).toBe(false);
        });
    });

    describe('Telemetry State Extraction (getPlaybackPositionSec & getCurrentVolume)', () => {
        beforeEach(() => {
            controller.register('telemetry_sound' as SoundId, { url: '' });
        });

        it('should return 0 for both if voice does not exist', () => {
            expect(controller.getPlaybackPositionSec(999 as PlaybackId)).toBe(0);
            expect(controller.getCurrentVolume(999 as PlaybackId)).toBe(0);
        });

        it('should return physical instance properties if voice is active and physical', () => {
            const id = controller.play('telemetry_sound' as SoundId, {})!;

            fakeInstance.currentTime = 4.25;
            fakeInstance.gainParam = { value: 0.85 };

            expect(controller.getPlaybackPositionSec(id)).toBe(4.25);
            expect(controller.getCurrentVolume(id)).toBe(0.85);
        });

        it('should calculate time mathematically if voice is paused or virtual', () => {
            const id = controller.play('telemetry_sound' as SoundId, { offset: 2.0 as Seconds })!;

            mockContext.currentTime = 128.45;

            const voice = controller.getLogicalVoice(id)!;
            voice.logicalState = 'paused';

            delete fakeInstance.currentTime;

            expect(controller.getPlaybackPositionSec(id)).toBeCloseTo(7.0);
        });

        it('should fallback to mathematical calculation for ghost voices (playVirtual)', () => {
            const id = controller.playVirtual('ghost_telemetry' as SoundId);

            mockContext.currentTime = 126.45;

            expect(controller.getPlaybackPositionSec(id)).toBeCloseTo(3.0);
        });

        it('should fallback to volume 1.0 if physical instance or gainParam is missing', () => {
            const id = controller.playVirtual('ghost_telemetry' as SoundId);

            expect(controller.getCurrentVolume(id)).toBe(1.0);

            const physicalId = controller.play('telemetry_sound' as SoundId, {})!;
            delete fakeInstance.gainParam;

            expect(controller.getCurrentVolume(physicalId)).toBe(1.0);
        });
    });

    describe('Voice Lifecycle: Virtualization on a Deaf Bus', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.spyOn(performance, 'now').mockReturnValue(100);

            mockContext = {
                currentTime: 0,
                createBufferSource: vi.fn().mockReturnValue({
                    start: vi.fn(),
                    stop: vi.fn(),
                    connect: vi.fn(),
                    disconnect: vi.fn(),
                    addEventListener: vi.fn(),
                    removeEventListener: vi.fn(),
                    playbackRate: { value: 1 },
                    loop: false
                })
            };

            const mockBuffer = { duration: 2 } as AudioBuffer;

            mockBufferResolver = vi.fn().mockReturnValue(mockBuffer);

            mockPool = {
                globalVoiceLimit: 32,
                events: { on: vi.fn(), emit: vi.fn() },
                acquire: vi.fn().mockImplementation((id, buffer) => {
                    const instance = new SoundInstance(
                        id,
                        { context: mockContext } as any,
                        {
                            createGain: vi.fn().mockReturnValue({
                                gain: { value: 1, setTargetAtTime: vi.fn() },
                                connect: vi.fn(),
                                disconnect: vi.fn()
                            })
                        } as any,
                        buffer,
                        { ramp: vi.fn() } as any
                    );
                    instance._poolIndex = 1;
                    return instance;
                }),
                dispose: vi.fn()
            };

            mockScheduler = {
                schedulePlay: vi.fn().mockImplementation((instance, when, offset, duration) => {
                    instance.play(when, offset, duration);
                })
            };
            mockBusSystem = { removeSidechainSource: vi.fn() };

            const mockRegistry = new Map([['test_sound' as SoundId, { options: { url: 'test.wav' } }]]);

            controller = new SoundController(
                mockPool,
                mockScheduler,
                mockContext,
                {} as any,
                mockRegistry,
                mockBusSystem,
                mockBufferResolver as any,
                vi.fn().mockReturnValue(undefined) as any,
                vi.fn() as any
            );
        });

        afterEach(() => {
            vi.useRealTimers();
            vi.restoreAllMocks();
        });

        it('should remove voice from activeVoices when virtualized and its logical duration ends', () => {
            const playbackId = controller.play('test_sound' as SoundId, {}) as PlaybackId;

            expect(playbackId).not.toBeNull();
            expect(controller.activeVoices.has(playbackId)).toBe(true);

            mockContext.currentTime = 0.5;

            controller.virtualize(playbackId);

            expect(controller.getPlaybackState(playbackId)).toBe('virtual');
            expect(controller.activeVoices.has(playbackId)).toBe(true);

            mockContext.currentTime = 2.1;
            controller.tick();

            expect(controller.activeVoices.has(playbackId)).toBe(false);
        });
    });

    describe('Registration (Default Options)', () => {
        it('should register sound with default empty url when options parameter is omitted', () => {
            controller.register('default_sound' as SoundId);

            const descriptor = (controller as any).registry.get('default_sound');
            expect(descriptor).toBeDefined();
            expect(descriptor.options).toEqual({ url: '' });
        });
    });

    describe('Playback Control (resumeAll)', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
            controller.register('other_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should resume all voices across all sounds when soundId is omitted', () => {
            const inst1 = { ...fakeInstance, resume: vi.fn(), pause: vi.fn() };
            const inst2 = { ...fakeInstance, resume: vi.fn(), pause: vi.fn() };
            mockPool.acquire.mockReturnValueOnce(inst1).mockReturnValueOnce(inst2);

            const id1 = controller.play('test_sound' as SoundId, {})!;
            const id2 = controller.play('other_sound' as SoundId, {})!;
            controller.pauseAll();

            controller.resumeAll();

            expect(inst1.resume).toHaveBeenCalledTimes(1);
            expect(inst2.resume).toHaveBeenCalledTimes(1);
            expect(controller.getLogicalState(id1)).toBe('playing');
            expect(controller.getLogicalState(id2)).toBe('playing');
        });

        it('should only resume voices matching the specified soundId when filtering', () => {
            const inst1 = { ...fakeInstance, resume: vi.fn(), pause: vi.fn() };
            const inst2 = { ...fakeInstance, resume: vi.fn(), pause: vi.fn() };
            mockPool.acquire.mockReturnValueOnce(inst1).mockReturnValueOnce(inst2);

            const id1 = controller.play('test_sound' as SoundId, {})!;
            const id2 = controller.play('other_sound' as SoundId, {})!;
            controller.pauseAll();

            controller.resumeAll('test_sound' as SoundId);

            expect(inst1.resume).toHaveBeenCalledTimes(1);
            expect(inst2.resume).not.toHaveBeenCalled();
            expect(controller.getLogicalState(id1)).toBe('playing');
            expect(controller.getLogicalState(id2)).toBe('paused');
        });
    });

    describe('Crossfade', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
            controller.register('other_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should cancel scheduled values and ramp out/in voices using equal-power curve', () => {
            const cancelSpyOut = vi.fn();
            const cancelSpyIn = vi.fn();
            const gainOut = { cancelScheduledValues: cancelSpyOut };
            const gainIn = { cancelScheduledValues: cancelSpyIn };

            const instOut = { ...fakeInstance, gainParam: gainOut };
            const instIn = { ...fakeInstance, gainParam: gainIn };

            mockPool.acquire.mockReturnValueOnce(instOut).mockReturnValueOnce(instIn);

            const outId = controller.play('test_sound' as SoundId, {})!;
            const inId = controller.play('other_sound' as SoundId, {})!;

            controller.crossfade(outId, inId, 500 as Milliseconds);

            expect(cancelSpyOut).toHaveBeenCalledWith(0);
            expect(cancelSpyIn).toHaveBeenCalledWith(0);
            expect(mockAutomation.ramp).toHaveBeenCalledWith(gainOut, 0, 500, 'equal-power');
            expect(mockAutomation.ramp).toHaveBeenCalledWith(gainIn, 1, 500, 'equal-power');
        });

        it('should warn when in-voice is missing with correct out=true, in=false formatting', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const outId = controller.play('test_sound' as SoundId, {})!;
            const missingInId = 999 as PlaybackId;

            controller.crossfade(outId, missingInId, 300 as Milliseconds);

            expect(warnSpy).toHaveBeenCalledWith(
                `[SoundController.crossfade] MISSING VOICE out=true in=false outId=${outId} inId=${missingInId}`
            );
            expect(mockAutomation.ramp).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('should warn when out-voice is missing with correct out=false, in=true formatting', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const inId = controller.play('test_sound' as SoundId, {})!;
            const missingOutId = 888 as PlaybackId;

            controller.crossfade(missingOutId, inId, 300 as Milliseconds);

            expect(warnSpy).toHaveBeenCalledWith(
                `[SoundController.crossfade] MISSING VOICE out=false in=true outId=${missingOutId} inId=${inId}`
            );
            warnSpy.mockRestore();
        });
    });

    describe('getVirtualReason and getPlaybackPositionSec Edge Cases', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should return the assigned virtual reason for a virtualized voice and undefined when active or missing', () => {
            const id = controller.play('test_sound' as SoundId, {})!;

            expect(controller.getVirtualReason(id)).toBeUndefined();
            expect(controller.getVirtualReason(999 as PlaybackId)).toBeUndefined();

            controller.virtualize(id, 'CULLED_BY_PRIORITY' as VirtualReason);
            expect(controller.getVirtualReason(id)).toBe('CULLED_BY_PRIORITY');
        });

        it('should return physicalInstance.currentTime directly when physicalInstance is present and active', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            fakeInstance.currentTime = 5.5;

            const pos = controller.getPlaybackPositionSec(id);

            expect(pos).toBe(5.5);
        });

        it('should calculate time via startOffset when physicalInstance is null but voice is active', () => {
            const id = controller.play('test_sound' as SoundId, { offset: 1.5 as Seconds })!;
            mockContext.currentTime = 130.45;
            const voice = controller.getLogicalVoice(id)!;
            voice.physicalInstance = null;

            const pos = controller.getPlaybackPositionSec(id);

            expect(pos).toBeCloseTo(8.5);
        });
    });

    describe('Virtual Queue Management (#removeFromVirtualQueue)', () => {
        it('should remove the exact targeted timer at a non-zero index using swap-and-pop', () => {
            controller.register('s1' as SoundId, { url: '', cooldownMs: 0 });
            controller.register('s2' as SoundId, { url: '', cooldownMs: 0 });
            controller.register('s3' as SoundId, { url: '', cooldownMs: 0 });

            const id1 = controller.play('s1' as SoundId, {})!;
            const id2 = controller.play('s2' as SoundId, {})!;
            const id3 = controller.play('s3' as SoundId, {})!;

            controller.virtualize(id1);
            controller.virtualize(id2);
            controller.virtualize(id3);

            const timers = (controller as any).virtualTimers;
            expect(timers.map((t: any) => t.playbackId)).toEqual([id1, id2, id3]);

            controller.devirtualize(id2);

            expect(timers).toHaveLength(2);
            expect(timers.map((t: any) => t.playbackId)).toEqual([id1, id3]);
        });
    });

    describe('Virtualization Constraints', () => {
        it('should NOT add looping voice to virtualTimers queue upon virtualization', () => {
            const id = controller.play('test_sound' as SoundId, { loop: true })!;
            fakeInstance.isLooping = true;
            fakeInstance.duration = 10;

            controller.virtualize(id);

            const timers = (controller as any).virtualTimers;
            expect(timers.find((t: any) => t.playbackId === id)).toBeUndefined();
        });

        it('should NOT add zero-duration voice to virtualTimers queue upon virtualization', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            fakeInstance.isLooping = false;
            fakeInstance.duration = 0;

            controller.virtualize(id);

            const timers = (controller as any).virtualTimers;
            expect(timers.find((t: any) => t.playbackId === id)).toBeUndefined();
        });
    });

    describe('Virtual Voice Expiration (tick)', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should NOT expire timer if currentTime is strictly less than endTime', () => {
            fakeInstance.duration = 10;
            fakeInstance.currentTime = 2;
            fakeInstance.playbackRate = 1;
            mockContext.currentTime = 100;
            const id = controller.play('test_sound' as SoundId, {})!;
            controller.virtualize(id);

            mockContext.currentTime = 107.9;
            controller.tick();

            expect((controller as any).virtualTimers).toHaveLength(1);
            expect(controller.activeVoices.has(id)).toBe(true);
        });

        it('should trigger forceNaturalEnd and pop timer when currentTime exactly equals endTime', () => {
            fakeInstance.duration = 5;
            fakeInstance.currentTime = 0;
            fakeInstance.playbackRate = 1;
            fakeInstance.forceNaturalEnd = vi.fn();
            mockContext.currentTime = 50;
            const id = controller.play('test_sound' as SoundId, {})!;
            controller.virtualize(id);

            mockContext.currentTime = 55.0;
            controller.tick();

            expect(fakeInstance.forceNaturalEnd).toHaveBeenCalledTimes(1);
            expect((controller as any).virtualTimers).toHaveLength(0);
        });
    });

    describe('Sidechain Management and Pool Index Boundaries', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should properly clear sidechain triggers on instance release when poolIndex is 0', () => {
            fakeInstance._poolIndex = 0;
            const id = controller.play('test_sound' as SoundId, {})!;
            controller.addSidechainTrigger(id, 'music' as BusId, 0.9);

            const releasedHandler = mockPool.events.on.mock.calls.find((call: any[]) => call[0] === 'released')[1];

            releasedHandler(fakeInstance);

            expect(mockBusSystem.removeSidechainSource).toHaveBeenCalledWith(
                fakeInstance.sidechainTriggerNode,
                'music'
            );
        });
    });

    describe('Lifecycle Telemetry Dispatches', () => {
        it('should dispatch accurate LIFECYCLE events for START, PAUSE, RESUME, and API_STOP', () => {
            mockContext.currentTime = 2.5;
            controller.register('telemetry_sound' as SoundId, { url: '' });

            const id = controller.play('telemetry_sound' as SoundId, {})!;
            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'LIFECYCLE',
                timestampMs: 2500,
                action: 'START',
                playbackId: id,
                soundId: 'telemetry_sound',
                reason: undefined
            });

            mockContext.currentTime = 3.0;
            controller.pauseById(id);
            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'LIFECYCLE',
                timestampMs: 3000,
                action: 'PAUSE',
                playbackId: id,
                soundId: 'telemetry_sound',
                reason: undefined
            });

            mockContext.currentTime = 3.5;
            controller.resumeById(id);
            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'LIFECYCLE',
                timestampMs: 3500,
                action: 'RESUME',
                playbackId: id,
                soundId: 'telemetry_sound',
                reason: undefined
            });

            mockContext.currentTime = 4.0;
            controller.stopById(id);
            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'LIFECYCLE',
                timestampMs: 4000,
                action: 'STOP',
                playbackId: id,
                soundId: 'telemetry_sound',
                reason: 'API_STOP'
            });
        });

        it('should dispatch LIFECYCLE VIRTUALIZE and REVIVE events with reasons', () => {
            mockContext.currentTime = 1.0;
            controller.register('virt_sound' as SoundId, { url: '', cooldownMs: 0 });
            const id = controller.play('virt_sound' as SoundId, {})!;
            mockTelemetry.dispatch.mockClear();

            controller.virtualize(id, 'CULLED_BY_DISTANCE' as VirtualReason);
            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'LIFECYCLE',
                timestampMs: 1000,
                action: 'VIRTUALIZE',
                playbackId: id,
                soundId: 'virt_sound',
                reason: 'CULLED_BY_DISTANCE'
            });

            controller.devirtualize(id);
            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'LIFECYCLE',
                timestampMs: 1000,
                action: 'REVIVE',
                playbackId: id,
                soundId: 'virt_sound',
                reason: undefined
            });
        });

        it('should dispatch LIFECYCLE VIRTUALIZE event on playVirtual', () => {
            mockContext.currentTime = 5.0;

            const ghostId = controller.playVirtual('ghost_sound' as SoundId, 'VIRTUAL_BY_API');

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'LIFECYCLE',
                timestampMs: 5000,
                action: 'VIRTUALIZE',
                playbackId: ghostId,
                soundId: 'ghost_sound',
                reason: 'VIRTUAL_BY_API'
            });
        });

        it('should dispatch LIFECYCLE STOP event with NATURAL_END on voice ended', () => {
            mockContext.currentTime = 10.0;
            controller.register('end_sound' as SoundId, { url: '' });
            const id = controller.play('end_sound' as SoundId, {})!;
            const endedCallback = fakeInstance.on.mock.calls.find((call: any[]) => call[0] === 'ended')[1];
            fakeInstance._currentPlaybackId = id;

            endedCallback(fakeInstance);

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'LIFECYCLE',
                timestampMs: 10000,
                action: 'STOP',
                playbackId: id,
                soundId: 'end_sound',
                reason: 'NATURAL_END'
            });
        });

        it('should dispatch CAUSE_CHAIN telemetry with exact millisecond timestamp and initiator on pool rejection', () => {
            mockContext.currentTime = 2.5;
            mockPool.acquire.mockReturnValueOnce('POOL_EXHAUSTED');
            controller.register('blocked_sound' as SoundId, { url: '' });

            controller.play('blocked_sound' as SoundId, {});

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'CAUSE_CHAIN',
                timestampMs: 2500,
                initiator: { type: 'API', method: 'controller.play' },
                result: {
                    type: 'BLOCKED',
                    reason: 'Pool rejected play for blocked_sound. Reason: POOL_EXHAUSTED'
                }
            });
        });

        it('should operate safely without throwing when telemetry dispatcher is omitted', () => {
            const controllerWithoutTelemetry = new SoundController(
                mockPool,
                mockScheduler,
                mockContext,
                mockAutomation,
                new Map() as any,
                mockBusSystem,
                mockBufferResolver as any,
                mockManifestResolver as any,
                mockStreamFactory as any
            );
            controllerWithoutTelemetry.register('sound' as SoundId, { url: '' });

            expect(() => {
                const id = controllerWithoutTelemetry.play('sound' as SoundId, {})!;
                controllerWithoutTelemetry.pauseById(id);
                controllerWithoutTelemetry.resumeById(id);
                controllerWithoutTelemetry.virtualize(id);
                controllerWithoutTelemetry.devirtualize(id);
                controllerWithoutTelemetry.stopById(id);
            }).not.toThrow();
        });
    });

    describe('Initial State and Guard Conditions', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
            controller.register('other_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should initialize logical voice position to { x: 0, y: 0, z: 0 } upon play', () => {
            controller.register('init_sound' as SoundId, { url: '' });

            const id = controller.play('init_sound' as SoundId, {})!;
            const voice = controller.getLogicalVoice(id);

            expect(voice?.position).toEqual({ x: 0, y: 0, z: 0 });
        });

        it('should only stop voices matching soundId when stopAll(soundId) is called', () => {
            const inst1 = { ...fakeInstance, stop: vi.fn() };
            const inst2 = { ...fakeInstance, stop: vi.fn() };
            mockPool.acquire.mockReturnValueOnce(inst1).mockReturnValueOnce(inst2);

            const id1 = controller.play('test_sound' as SoundId, {})!;
            const id2 = controller.play('other_sound' as SoundId, {})!;

            const stopByIdSpy = vi.spyOn(controller, 'stopById');

            controller.stopAll('test_sound' as SoundId);

            expect(stopByIdSpy).toHaveBeenCalledWith(id1);
            expect(stopByIdSpy).not.toHaveBeenCalledWith(id2);
            expect(inst1.stop).toHaveBeenCalledTimes(1);
            expect(inst2.stop).not.toHaveBeenCalled();
        });

        it('should safely do nothing when stopById, pauseById, resumeById, or setVolume is called for non-existent playbackId', () => {
            expect(() => {
                controller.stopById(999 as PlaybackId);
                controller.pauseById(999 as PlaybackId);
                controller.resumeById(999 as PlaybackId);
                controller.setVolume(999 as PlaybackId, 0.5);
            }).not.toThrow();
        });

        it('should return undefined safely from getLogicalState when voice is missing', () => {
            expect(controller.getLogicalState(999 as PlaybackId)).toBeUndefined();
        });

        it('should default curveType to linear and delay to 0 in fadeVolume when omitted', () => {
            const id = controller.play('test_sound' as SoundId, {})!;

            controller.fadeVolume(id, 0.2, 800 as Milliseconds);

            expect(mockAutomation.ramp).toHaveBeenCalledWith(fakeInstance.gainParam, 0.2, 800, 'linear', 0);
        });

        it('should safely handle pauseById and resumeById when physical instance lacks pause/resume methods', () => {
            const instanceWithoutMethods = { ...fakeInstance };
            delete instanceWithoutMethods.pause;
            delete instanceWithoutMethods.resume;
            mockPool.acquire.mockReturnValueOnce(instanceWithoutMethods);

            const id = controller.play('test_sound' as SoundId, {})!;

            expect(() => {
                controller.pauseById(id);
                controller.resumeById(id);
            }).not.toThrow();
        });
    });

    describe('Sidechain Optional Chaining Guards', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should safely no-op when adding or removing sidechain triggers on an instance with out-of-bounds poolIndex', () => {
            const instOutOfBounds = {
                ...fakeInstance,
                _poolIndex: 999,
                sidechainTriggerNode: {}
            };
            mockPool.acquire.mockReturnValueOnce(instOutOfBounds);
            const id = controller.play('test_sound' as SoundId, {})!;

            expect(() => {
                controller.addSidechainTrigger(id, 'music' as BusId, 0.8);
                controller.removeSidechainTrigger(id, 'music' as BusId);
            }).not.toThrow();
        });
    });

    describe('stopById Virtual Node Guard', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should NOT delete activeVoice on stopById if physicalInstance is null and isVirtualNode is false', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            const voice = controller.getLogicalVoice(id)!;
            voice.physicalInstance = null;
            (voice as any).isVirtualNode = false;

            controller.stopById(id);

            expect(controller.activeVoices.has(id)).toBe(true);
        });
    });

    describe('getPlaybackPositionSec Numeric CurrentTime Guard', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should return 0 when voice is playing and physical but currentTime property is non-numeric', () => {
            const instWithoutTime = { ...fakeInstance };
            delete instWithoutTime.currentTime;
            mockPool.acquire.mockReturnValueOnce(instWithoutTime);

            mockContext.currentTime = 500;
            const id = controller.play('test_sound' as SoundId, { offset: 2 as Seconds })!;

            const pos = controller.getPlaybackPositionSec(id);

            expect(pos).toBe(0);
        });
    });

    describe('virtualize Scheduling Constraints', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should NOT push timer when sound is looping even if duration is positive', () => {
            const loopingInst = {
                ...fakeInstance,
                virtualize: vi.fn(),
                isLooping: true,
                duration: 10,
                currentTime: 0,
                playbackRate: 1
            };
            mockPool.acquire.mockReturnValueOnce(loopingInst);
            const id = controller.play('test_sound' as SoundId, {})!;

            controller.virtualize(id);

            const timers = (controller as any).virtualTimers;
            expect(timers.find((t: any) => t.playbackId === id)).toBeUndefined();
        });

        it('should NOT push timer when non-looping sound has duration of 0', () => {
            const zeroDurationInst = {
                ...fakeInstance,
                virtualize: vi.fn(),
                isLooping: false,
                duration: 0,
                currentTime: 0,
                playbackRate: 1
            };
            mockPool.acquire.mockReturnValueOnce(zeroDurationInst);
            const id = controller.play('test_sound' as SoundId, {})!;

            controller.virtualize(id);

            const timers = (controller as any).virtualTimers;
            expect(timers.find((t: any) => t.playbackId === id)).toBeUndefined();
        });
    });

    describe('virtualize / devirtualize Sidechain Integrity', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should NOT call busSystem when sidechainTriggerNode is missing during virtualize/devirtualize', () => {
            const instNoTrigger = {
                ...fakeInstance,
                _poolIndex: 2,
                virtualize: vi.fn(),
                devirtualize: vi.fn(),
                sidechainTriggerNode: undefined
            };
            mockPool.acquire.mockReturnValueOnce(instNoTrigger);
            const id = controller.play('test_sound' as SoundId, {})!;

            controller.virtualize(id);
            controller.devirtualize(id);

            expect(mockBusSystem.removeSidechainSource).not.toHaveBeenCalled();
            expect(mockBusSystem.addSidechainSource).not.toHaveBeenCalled();
        });

        it('should not throw when virtualize/devirtualize is called on an instance with out-of-bounds poolIndex', () => {
            const instOutOfBounds = {
                ...fakeInstance,
                _poolIndex: 999,
                virtualize: vi.fn(),
                devirtualize: vi.fn(),
                sidechainTriggerNode: {}
            };
            mockPool.acquire.mockReturnValueOnce(instOutOfBounds);
            const id = controller.play('test_sound' as SoundId, {})!;

            expect(() => {
                controller.virtualize(id);
                controller.devirtualize(id);
            }).not.toThrow();
        });
    });

    describe('#handleVoiceEnded Guard', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should safely do nothing when ended event fires on an instance with undefined playbackId', () => {
            controller.play('test_sound' as SoundId, {})!;
            const endedCallback = fakeInstance.on.mock.calls.find((call: any[]) => call[0] === 'ended')![1];

            const deleteSpy = vi.spyOn(controller.activeVoices, 'delete');
            mockTelemetry.dispatch.mockClear();

            const unassignedInstance = { ...fakeInstance, _currentPlaybackId: undefined };
            endedCallback(unassignedInstance);

            expect(deleteSpy).not.toHaveBeenCalled();
            expect(mockTelemetry.dispatch).not.toHaveBeenCalled();
        });
    });

    describe('#handleInstanceReleased Integrity', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, { url: '', cooldownMs: 0 });
        });

        it('should early-return safely without throwing when poolIndex is undefined or negative', () => {
            const releasedHandler = mockPool.events.on.mock.calls.find((call: any[]) => call[0] === 'released')[1];

            expect(() => {
                releasedHandler({ _poolIndex: undefined, sidechainTriggerNode: {} });
                releasedHandler({ _poolIndex: -1, sidechainTriggerNode: {} });
            }).not.toThrow();
            expect(mockBusSystem.removeSidechainSource).not.toHaveBeenCalled();
        });

        it('should clear targetBuses but NOT call removeSidechainSource when sidechainTriggerNode is undefined', () => {
            fakeInstance._poolIndex = 3;
            const id = controller.play('test_sound' as SoundId, {})!;
            controller.addSidechainTrigger(id, 'music' as BusId, 0.7);

            const releasedHandler = mockPool.events.on.mock.calls.find((call: any[]) => call[0] === 'released')[1];

            const instanceWithoutTrigger = { _poolIndex: 3, sidechainTriggerNode: undefined };
            releasedHandler(instanceWithoutTrigger);

            expect(mockBusSystem.removeSidechainSource).not.toHaveBeenCalled();
            const sidechainMap = (controller as any)['#sidechainLinks']?.[3];
            if (sidechainMap) {
                expect(sidechainMap.size).toBe(0);
            }
        });
    });
});
