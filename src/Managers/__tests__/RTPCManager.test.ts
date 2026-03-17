import { describe, it, expect, vi, beforeEach } from 'vitest';

import RTPCManager from '../RTPCManager';

describe('RTPCManager', () => {
    let manager: RTPCManager;

    beforeEach(() => {
        manager = new RTPCManager();
    });

    it('should store and retrieve a single value', () => {
        manager.setValue('MUSIC_VOLUME', 0.8);
        expect(manager.getValue('MUSIC_VOLUME')).toBe(0.8);
    });

    it('should return default value if parameter is not set', () => {
        expect(manager.getValue('UNKNOWN_PARAM')).toBe(0);
        expect(manager.getValue('UNKNOWN_PARAM', 42)).toBe(42);
    });

    it('should emit an event when value is changed', () => {
        const spy = vi.fn();
        manager.events.on('MUSIC_VOLUME', spy);

        manager.setValue('MUSIC_VOLUME', 0.5);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(0.5);
    });

    it('should NOT emit an event if the value has not changed (early return)', () => {
        manager.setValue('MUSIC_VOLUME', 0.5);

        const spy = vi.fn();
        manager.events.on('MUSIC_VOLUME', spy);

        manager.setValue('MUSIC_VOLUME', 0.5);

        expect(spy).not.toHaveBeenCalled();
    });

    it('should set multiple values and emit events for each', () => {
        const spyMusic = vi.fn();
        const spySFX = vi.fn();
        manager.events.on('MUSIC_VOLUME', spyMusic);
        manager.events.on('SFX_VOLUME', spySFX);

        manager.setValues({
            MUSIC_VOLUME: 0.7,
            SFX_VOLUME: 0.9
        });

        expect(manager.getValue('MUSIC_VOLUME')).toBe(0.7);
        expect(manager.getValue('SFX_VOLUME')).toBe(0.9);
        expect(spyMusic).toHaveBeenCalledWith(0.7);
        expect(spySFX).toHaveBeenCalledWith(0.9);
    });

    it('should clear all values and events on reset', () => {
        const spy = vi.fn();
        manager.events.on('MUSIC_VOLUME', spy);

        manager.setValue('MUSIC_VOLUME', 1);
        expect(spy).toHaveBeenCalledTimes(1);

        manager.reset();

        spy.mockClear();

        expect(manager.getValue('MUSIC_VOLUME', -1)).toBe(-1);

        manager.setValue('MUSIC_VOLUME', 0.5);
        expect(spy).not.toHaveBeenCalled();
    });
});
