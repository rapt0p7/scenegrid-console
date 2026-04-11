// noinspection D
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SoundController } from '@infrastructure/loader/SoundController.js';

import type { PlaybackId, SoundId } from '@domain/Types/Branded.js';
import type { PlaybackScheduler, AutomationEngine, AudioCtx } from '@infrastructure';
import type SoundPoolManager from '@infrastructure/instance/SoundPoolManager.js';

describe('SoundController', () => {
    let mockPool: any;
    let mockScheduler: any;
    let mockContext: any;
    let mockAutomation: any;
    let controller: SoundController;
    let fakeBuffer: AudioBuffer;
    let fakeInstance: any;

    beforeEach(() => {
        vi.clearAllMocks();

        fakeBuffer = {} as AudioBuffer;

        fakeInstance = {
            setLoop: vi.fn(),
            setRate: vi.fn(),
            stop: vi.fn(),
            setPosition: vi.fn(),
            cancelScheduled: vi.fn(),
            on: vi.fn().mockReturnValue(() => 'unsubscribed'),
            instanceGain: {
                gain: {}
            },
            state: 'playing'
        };

        mockPool = {
            acquire: vi.fn().mockReturnValue(fakeInstance),
            dispose: vi.fn()
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

        controller = new SoundController(mockPool, mockScheduler, mockContext, mockAutomation);
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
});
