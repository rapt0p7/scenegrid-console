import { describe, it, expect, vi, beforeEach } from 'vitest';

import DuckingManager from '../DuckingManager.js';

import type AudioBusSystem from '../../BusSystem/AudioBusSystem.js';
import type { ISoundInstance, AudioNodeLike } from '@infrastructure';

describe('DuckingManager', () => {
    let mockBusSystem: any;
    let mockSidechain: any;
    let mockInstance: any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    let eventHandlers: Record<string, Function>;
    let manager: DuckingManager;

    beforeEach(() => {
        vi.clearAllMocks();
        eventHandlers = {};

        mockSidechain = {
            addSource: vi.fn(),
            removeSource: vi.fn()
        };

        mockBusSystem = {
            getSidechain: vi.fn().mockReturnValue(mockSidechain)
        } as unknown as AudioBusSystem;

        mockInstance = {
            instanceGain: {} as AudioNodeLike,
            on: vi.fn().mockImplementation((event, handler) => {
                eventHandlers[event] = handler;
                return vi.fn();
            })
        } as unknown as ISoundInstance;

        manager = new DuckingManager(mockBusSystem);
    });

    it('should add instance gain to sidechain and setup cleanup events', () => {
        manager.triggerDucking(mockInstance, 'music_bus', 0.8);

        expect(mockBusSystem.getSidechain).toHaveBeenCalledWith('music_bus');

        expect(mockSidechain.addSource).toHaveBeenCalledWith(mockInstance.instanceGain, 0.8);

        expect(mockInstance.on).toHaveBeenCalledWith('ended', expect.any(Function));
        expect(mockInstance.on).toHaveBeenCalledWith('stopped', expect.any(Function));
    });

    it('should remove instance from sidechain when it stops playing (Memory Leak Prevention)', () => {
        manager.triggerDucking(mockInstance, 'music_bus', 1);

        expect(mockSidechain.removeSource).not.toHaveBeenCalled();

        eventHandlers['ended']();

        expect(mockSidechain.removeSource).toHaveBeenCalledWith(mockInstance.instanceGain);
    });

    it('should support ducking multiple buses simultaneously', () => {
        manager.triggerDucking(mockInstance, ['music_bus', 'ambience_bus'], [1, 0.5]);

        expect(mockBusSystem.getSidechain).toHaveBeenCalledWith('music_bus');
        expect(mockBusSystem.getSidechain).toHaveBeenCalledWith('ambience_bus');

        expect(mockSidechain.addSource).toHaveBeenCalledTimes(2);
        expect(mockSidechain.addSource).toHaveBeenNthCalledWith(1, mockInstance.instanceGain, 1);
        expect(mockSidechain.addSource).toHaveBeenNthCalledWith(2, mockInstance.instanceGain, 0.5);
    });

    it('should clear all active sidechains on clearAll() and handle removeSource errors safely', () => {
        manager.triggerDucking(mockInstance, 'music_bus', 1);

        mockSidechain.removeSource.mockImplementationOnce(() => {
            throw new Error('Remove failed');
        });

        expect(() => manager.clearAll()).not.toThrow();
        expect(mockSidechain.removeSource).toHaveBeenCalledWith(mockInstance.instanceGain);

        mockSidechain.removeSource.mockClear();
        if (eventHandlers['ended']) {
            eventHandlers['ended']();
        }
        expect(mockSidechain.removeSource).not.toHaveBeenCalled();
    });

    it('should catch errors during addSource in triggerDucking and log a warning', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const testError = new Error('Add source failed');

        mockSidechain.addSource.mockImplementationOnce(() => {
            throw testError;
        });

        manager.triggerDucking(mockInstance, 'music_bus', 1);

        expect(warnSpy).toHaveBeenCalledWith(
            `[DuckingManager] Failed to add source to sidechain "music_bus"`,
            testError
        );

        warnSpy.mockRestore();
    });

    it('should handle removeSource errors safely during event cleanup (cleanupInstance)', () => {
        manager.triggerDucking(mockInstance, 'music_bus', 1);

        mockSidechain.removeSource.mockImplementationOnce(() => {
            throw new Error('Event cleanup failed');
        });

        expect(() => {
            if (eventHandlers['ended']) eventHandlers['ended']();
        }).not.toThrow();

        expect(mockSidechain.removeSource).toHaveBeenCalled();
    });
});
