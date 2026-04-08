import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SoundController } from '@infrastructure';

import type SoundPoolManager from '../../instance/SoundPoolManager.js';
import type { PlaybackScheduler } from '@infrastructure';

describe('SoundController', () => {
    let mockPool: any;
    let mockScheduler: any;
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
            setPosition: vi.fn()
        };

        mockPool = {
            acquire: vi.fn().mockReturnValue(fakeInstance),
            dispose: vi.fn()
        } as unknown as SoundPoolManager;

        mockScheduler = {
            schedulePlay: vi.fn()
        } as unknown as PlaybackScheduler;

        controller = new SoundController(mockPool, mockScheduler);
    });

    describe('Registration', () => {
        it('should register a new sound with default options', () => {
            controller.register('sound_1', fakeBuffer);

            const registry = (controller as any).registry;
            expect(registry.has('sound_1')).toBe(true);
            expect(registry.get('sound_1').options).toEqual({ url: '' });
        });

        it('should register a new sound with custom options', () => {
            controller.register('sound_2', fakeBuffer, { url: 'path/to/sound.wav' });

            expect((controller as any).registry.get('sound_2').options).toEqual({ url: 'path/to/sound.wav' });
        });

        it('should throw an error if registering an already existing sound', () => {
            controller.register('duplicate_sound', fakeBuffer);

            expect(() => {
                controller.register('duplicate_sound', fakeBuffer);
            }).toThrow('already registered');
        });
    });

    describe('Unregistration', () => {
        it('should remove sound from registry and dispose from pool', () => {
            controller.register('sound_to_remove', fakeBuffer);
            controller.unregister('sound_to_remove');

            expect((controller as any).registry.has('sound_to_remove')).toBe(false);
            expect(mockPool.dispose).toHaveBeenCalledWith('sound_to_remove');
        });
    });

    describe('Playback', () => {
        it('should throw an error if playing an unregistered sound', () => {
            const result = controller.play('unknown_sound', {});
            expect(result).toBeNull();
        });

        it('should return null if pool fails to acquire an instance (e.g., voice limit reached)', () => {
            controller.register('sound_limit', fakeBuffer);
            mockPool.acquire.mockReturnValueOnce(null);

            const result = controller.play('sound_limit', {});

            expect(result).toBeNull();
            expect(mockScheduler.schedulePlay).not.toHaveBeenCalled();
        });

        it('should acquire instance, set params, schedule play, and return instance', () => {
            controller.register('hero_jump', fakeBuffer);

            const result = controller.play('hero_jump', {
                when: 0.5,
                offset: 1.2,
                duration: 2,
                loop: true,
                rate: 1.5
            });

            expect(mockPool.acquire).toHaveBeenCalledWith('hero_jump');
            expect(fakeInstance.setLoop).toHaveBeenCalledWith(true);
            expect(fakeInstance.setRate).toHaveBeenCalledWith(1.5);
            expect(mockScheduler.schedulePlay).toHaveBeenCalledWith(fakeInstance, 0.5, 1.2, 2);
            expect(result).toEqual({ playbackId: expect.any(Number), instance: fakeInstance });
        });

        it('should use correct default values for playback options', () => {
            controller.register('simple_sound', fakeBuffer);

            controller.play('simple_sound', {});

            expect(fakeInstance.setLoop).toHaveBeenCalledWith(false);
            expect(fakeInstance.setRate).toHaveBeenCalledWith(1);
            expect(mockScheduler.schedulePlay).toHaveBeenCalledWith(fakeInstance, 0, 0, undefined);
        });

        it('should skip playback if cooldown is set and did not pass', () => {
            controller.register('sound_limit', fakeBuffer, { url: 'path/to/sound.wav', cooldownMs: 30 });

            const result = controller.play('sound_limit', {});
            const result2 = controller.play('sound_limit', {});

            expect(result).toEqual({ playbackId: expect.any(Number), instance: fakeInstance });
            expect(result2).toBeNull();
            expect(mockScheduler.schedulePlay).toHaveBeenCalledTimes(1);
        });
    });

    describe('Stop', () => {
        it('should call pool.dispose to stop all instances of a specific sound', () => {
            controller.stopAll('bgm_music');
            expect(mockPool.dispose).toHaveBeenCalledWith('bgm_music');
        });

        it('should call pool.dispose to stop absolutely everything if no soundId is provided', () => {
            controller.stopAll();
            expect(mockPool.dispose).toHaveBeenCalledWith(undefined);
        });
    });

    describe('Logical Voices & State Management', () => {
        beforeEach(() => {
            (controller as any).registry.set('test_sound', { options: {} });
            (controller as any).registry.set('other_sound', { options: {} });

            vi.mocked(mockPool.acquire).mockReturnValue(fakeInstance);
        });

        it('should store logical voice, expose it via getLogicalVoice, and assign onRevive', () => {
            const mockRevive = vi.fn();
            const result = controller.play('test_sound', { onRevive: mockRevive });

            expect(result).not.toBeNull();
            const voice = controller.getLogicalVoice(result!.playbackId);

            expect(voice).toBeDefined();
            expect(voice?.soundId).toBe('test_sound');
            expect(voice?.physicalInstance).toBe(fakeInstance);

            expect((fakeInstance as any).onRevive).toBe(mockRevive);
        });

        it('should stop a specific physical instance by playbackId and remove it from activeVoices', () => {
            const result = controller.play('test_sound', {});
            const id = result!.playbackId;

            expect(controller.activeVoices.has(id)).toBe(true);

            controller.stopById(id);

            expect(fakeInstance.stop).toHaveBeenCalled();
            expect(controller.activeVoices.has(id)).toBe(false);
        });

        it('should not throw if stopById is called with an invalid id', () => {
            expect(() => controller.stopById(9999)).not.toThrow();
        });

        it('should clear specific sounds from activeVoices when stopAll is called with soundId', () => {
            const r1 = controller.play('test_sound', {});
            const r2 = controller.play('other_sound', {});

            controller.stopAll('test_sound');

            expect(controller.activeVoices.has(r1!.playbackId)).toBe(false);
            expect(controller.activeVoices.has(r2!.playbackId)).toBe(true);
        });

        it('should clear ALL sounds from activeVoices when stopAll is called without arguments', () => {
            controller.play('test_sound', {});
            controller.play('other_sound', {});

            controller.stopAll();

            expect(controller.activeVoices.size).toBe(0);
        });

        describe('setPosition', () => {
            it('should do nothing if playbackId is not found', () => {
                expect(() => controller.setPosition(9999, 10, 20, 30)).not.toThrow();
            });

            it('should update logical position and physical instance position', () => {
                const result = controller.play('test_sound', {});
                const id = result!.playbackId;

                controller.setPosition(id, 10, 20, 30);

                const voice = controller.getLogicalVoice(id);
                expect(voice?.position).toEqual({ x: 10, y: 20, z: 30 });
                expect(fakeInstance.setPosition).toHaveBeenCalledWith(10, 20, 30);
            });

            it('should update logical position even if physicalInstance is null (virtualized voice)', () => {
                const result = controller.play('test_sound', {});
                const id = result!.playbackId;

                const voice = controller.getLogicalVoice(id)!;
                voice.physicalInstance = null as any;

                fakeInstance.setPosition.mockClear();

                controller.setPosition(id, 5, 15, 25);

                expect(voice.position).toEqual({ x: 5, y: 15, z: 25 });
                expect(fakeInstance.setPosition).not.toHaveBeenCalled();
            });
        });
    });
});
