// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { SoundInstance } from '@infrastructure';
import { SoundController } from '@infrastructure/loader/SoundController.js';

import type { BusId, PlaybackId, SoundId } from '@shared/Types/Branded.js';
import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type SoundPoolManager from '@infrastructure/instance/SoundPoolManager.js';
import type { PlaybackScheduler } from '@infrastructure/scheduling/PlaybackScheduler.js';
import type { AudioCtx } from '@infrastructure/types/IAudioContext.js';

describe('SoundController', () => {
    let mockPool: any;
    let mockScheduler: any;
    let mockContext: any;
    let mockAutomation: any;
    let mockBusSystem: any;
    let controller: SoundController;
    let fakeBuffer: AudioBuffer;
    let fakeInstance: any;

    beforeEach(() => {
        vi.clearAllMocks();

        fakeBuffer = {} as AudioBuffer;

        fakeInstance = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            _poolIndex: 5,
            setLoop: vi.fn(),
            setRate: vi.fn(),
            stop: vi.fn(),
            setPosition: vi.fn(),
            cancelScheduled: vi.fn(),
            on: vi.fn().mockReturnValue(() => 'unsubscribed'),
            gainParam: {},
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
        } as unknown as SoundPoolManager;

        mockScheduler = {
            schedulePlay: vi.fn()
        } as unknown as PlaybackScheduler;

        mockContext = {
            currentTime: 123.45,
            sampleRate: 48_000
        } as unknown as AudioCtx;

        mockAutomation = {
            set: vi.fn(),
            ramp: vi.fn()
        } as unknown as AutomationEngine;

        mockBusSystem = {
            getBus: vi.fn().mockReturnValue({ inputNode: {} }),
            addSidechainSource: vi.fn(),
            removeSidechainSource: vi.fn()
        };

        controller = new SoundController(
            mockPool,
            mockScheduler,
            mockContext,
            mockAutomation,
            new Map() as any,
            mockBusSystem
        );
    });

    describe('Registration', () => {
        it('should register a new sound with default options', () => {
            controller.register('sound_1' as SoundId, fakeBuffer);

            const registry = (controller as any).registry;
            expect(registry.has('sound_1')).toBe(true);
            expect(registry.get('sound_1').options).toEqual({ url: '' });
        });

        it('should not throw and not overwrite if registering an already existing sound', () => {
            controller.register('duplicate_sound' as SoundId, fakeBuffer, { url: 'first' });

            expect(() => {
                controller.register('duplicate_sound' as SoundId, fakeBuffer, { url: 'second' });
            }).not.toThrow();

            expect((controller as any).registry.get('duplicate_sound').options.url).toBe('first');
        });
    });

    describe('Unregistration', () => {
        it('should remove sound from registry and dispose from pool', () => {
            controller.register('sound_to_remove' as SoundId, fakeBuffer);
            controller.unregister('sound_to_remove' as SoundId);

            expect((controller as any).registry.has('sound_to_remove')).toBe(false);
            expect(mockPool.dispose).toHaveBeenCalledWith('sound_to_remove');
        });
    });

    describe('Playback', () => {
        it('should return null if playing an unregistered sound', () => {
            const result = controller.play('unknown_sound' as SoundId, {});
            expect(result).toBeNull();
        });

        it('should acquire instance with buffer, schedule play, and return PlaybackId', () => {
            controller.register('hero_jump' as SoundId, fakeBuffer);

            const playbackId = controller.play('hero_jump' as SoundId, {
                when: 0.5,
                offset: 1.2,
                duration: 2,
                loop: true,
                rate: 1.5
            });

            expect(mockPool.acquire).toHaveBeenCalledWith('hero_jump', fakeBuffer);
            expect(fakeInstance.setLoop).toHaveBeenCalledWith(true);
            expect(fakeInstance.setRate).toHaveBeenCalledWith(1.5);
            expect(mockScheduler.schedulePlay).toHaveBeenCalledWith(fakeInstance, 0.5, 1.2, 2);

            expect(typeof playbackId).toBe('number');
        });

        it('should skip playback if cooldown is set and did not pass', () => {
            controller.register('sound_limit' as SoundId, fakeBuffer, { url: 'path/to/sound.wav', cooldownMs: 30 });

            const id1 = controller.play('sound_limit' as SoundId, {});
            const id2 = controller.play('sound_limit' as SoundId, {});

            expect(typeof id1).toBe('number');
            expect(id2).toBeNull();
            expect(mockScheduler.schedulePlay).toHaveBeenCalledTimes(1);
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

            controller.register('test_sound' as any, {} as any, { url: 'dummy.wav', cooldownMs: 0 });
            controller.register('other_sound' as any, {} as any, { url: 'dummy2.wav', cooldownMs: 0 });

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
            controller.register('test_sound' as SoundId, fakeBuffer);
            controller.register('other_sound' as SoundId, fakeBuffer);
        });

        it('should stop instance and clean up activeVoices on ended event', () => {
            const id = controller.play('test_sound' as SoundId, {})!;

            const endedCallback = fakeInstance.on.mock.calls.find((call: any[]) => call[0] === 'ended')[1];

            controller.stopById(id, 1.5);
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
            controller.register('test_sound' as SoundId, fakeBuffer);
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
            controller.register('test_sound' as SoundId, fakeBuffer);
        });

        it('should update logical position and physical instance position', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            controller.setPosition(id, 10, 20, 30);

            const voice = controller.getLogicalVoice(id);
            expect(voice?.position).toEqual({ x: 10, y: 20, z: 30 });
            expect(fakeInstance.setPosition).toHaveBeenCalledWith(10, 20, 30);
        });
    });

    describe('Routing & Bus Integration (Inversion of Control)', () => {
        let playbackId: PlaybackId;

        beforeEach(() => {
            controller.register('route_sound' as SoundId, fakeBuffer);
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

            controller.register('test_sound' as SoundId, fakeBuffer);
            playbackId = controller.play('test_sound' as SoundId, {}) as PlaybackId;
        });

        it('should return null from play() if pool fails to acquire an instance', () => {
            mockPool.acquire.mockReturnValueOnce(null);

            controller.register('failed_sound' as SoundId, fakeBuffer);
            const result = controller.play('failed_sound' as SoundId, {});

            expect(result).toBeNull();
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
            controller.register('revive_sound' as SoundId, fakeBuffer);
            const revivableId = controller.play('revive_sound' as SoundId, { onRevive: reviveSpy }) as PlaybackId;

            controller.devirtualize(revivableId);
            expect(fakeInstance.devirtualize).toHaveBeenCalled();
            expect(reviveSpy).toHaveBeenCalledWith(revivableId);

            expect(() => {
                controller.devirtualize(999 as PlaybackId);
            }).not.toThrow();
        });

        it('should format arguments and delegate fadeVolume() correctly using gainParam', () => {
            controller.fadeVolume(playbackId, 0.5, 1000, 'equal-power', 100);

            expect(mockAutomation.ramp).toHaveBeenCalledWith(fakeInstance.gainParam, 0.5, 1000, 'equal-power', 100);

            expect(() => {
                controller.fadeVolume(999 as PlaybackId, 1, 1);
            }).not.toThrow();
        });

        it('should delegate fadeParameter() correctly', () => {
            controller.fadeParameter(playbackId, 'filterFrequency', 2000, 500);

            expect(fakeInstance.automate).toHaveBeenCalledWith('filterFrequency', 2000, 500);

            expect(() => {
                controller.fadeParameter(999 as PlaybackId, 'pitch', 1, 1);
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
            controller.register('swap_sound' as SoundId, fakeBuffer, { url: '', cooldownMs: 0 });

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
            controller.register('end_sound' as SoundId, fakeBuffer, { url: '', cooldownMs: 0 });

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
                controller.fadeVolume(id, 1, 100);
                controller.fadeParameter(id, 'pitch', 2, 100);
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
    });
});

describe('Voice Lifecycle: Virtualization on a Deaf Bus', () => {
    let controller: SoundController;
    let mockContext: any;
    let mockPool: any;

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

        const mockScheduler = {
            schedulePlay: vi.fn().mockImplementation((instance, when, offset, duration) => {
                instance.play(when, offset, duration);
            })
        };
        const mockBusSystem = { removeSidechainSource: vi.fn() };
        const mockRegistry = new Map([['test_sound' as SoundId, { buffer: mockBuffer, options: { url: 'test.wav' } }]]);

        controller = new SoundController(
            mockPool,
            mockScheduler as any,
            mockContext,
            {} as any,
            mockRegistry,
            mockBusSystem as any
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
