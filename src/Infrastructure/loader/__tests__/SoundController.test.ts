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
            instanceGain: {
                gain: {}
            },
            outputNode: {},
            state: 'playing'
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
            connectNodeToBus: vi.fn(),
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

        it('should delegate setVolume to AutomationEngine', () => {
            controller.setVolume(playbackId, 0.75);
            expect(mockAutomation.set).toHaveBeenCalledWith(fakeInstance.instanceGain.gain, 0.75);
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

    describe('Routing & Bus Integration', () => {
        let playbackId: PlaybackId;

        beforeEach(() => {
            controller.register('route_sound' as SoundId, fakeBuffer);
            playbackId = controller.play('route_sound' as SoundId, {}) as PlaybackId;
        });

        it('should delegate routeToBus using physical outputNode', () => {
            controller.routeToBus(playbackId, 'music' as BusId);

            expect(mockBusSystem.connectNodeToBus).toHaveBeenCalledWith(fakeInstance.outputNode, 'music');
        });

        it('should safely ignore routeToBus if voice is missing', () => {
            expect(() => {
                controller.routeToBus(999 as PlaybackId, 'sfx' as BusId);
            }).not.toThrow();
        });

        it('should delegate addSidechainTrigger using instanceGain node', () => {
            controller.addSidechainTrigger(playbackId, 'ducked' as BusId, 0.8);

            expect(mockBusSystem.addSidechainSource).toHaveBeenCalledWith(fakeInstance.instanceGain, 'ducked', 0.8);
        });

        it('should delegate removeSidechainTrigger using instanceGain node', () => {
            controller.removeSidechainTrigger(playbackId, 'ducked' as BusId);

            expect(mockBusSystem.removeSidechainSource).toHaveBeenCalledWith(fakeInstance.instanceGain, 'ducked');
        });

        it('should automatically clear ALL sidechain triggers when instance is released back to pool', () => {
            controller.addSidechainTrigger(playbackId, 'ducked' as BusId, 0.8);
            controller.addSidechainTrigger(playbackId, 'ambience' as BusId, 0.5);

            const releasedHandler = mockPool.events.on.mock.calls.find((call: any[]) => call[0] === 'released')[1];
            expect(releasedHandler).toBeDefined();

            releasedHandler(fakeInstance);

            expect(mockBusSystem.removeSidechainSource).toHaveBeenCalledWith(fakeInstance.instanceGain, 'ducked');
            expect(mockBusSystem.removeSidechainSource).toHaveBeenCalledWith(fakeInstance.instanceGain, 'ambience');
        });
    });

    describe('Missing Coverage & Edge Cases (API & Virtualization)', () => {
        let playbackId: PlaybackId;

        beforeEach(() => {
            fakeInstance.virtualize = vi.fn();
            fakeInstance.devirtualize = vi.fn();
            fakeInstance.automate = vi.fn();

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

        it('should format arguments and delegate fadeVolume() correctly', () => {
            controller.fadeVolume(playbackId, 0.5, 1000, 'equal-power', 100);

            expect(mockAutomation.ramp).toHaveBeenCalledWith(
                fakeInstance.instanceGain.gain,
                0.5,
                1000,
                'equal-power',
                100
            );

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
            // eslint-disable-next-line max-params
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
