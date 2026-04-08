import { describe, it, expect, vi, beforeEach } from 'vitest';

import ListenerManager from '@infrastructure/context/ListenerManager.js';

import AudioContextFactory from '../AudioContextFactory.js';
import AudioContextManager from '../AudioContextManager.js';
import UnlockManager from '../UnlockManager.js';

vi.mock('../AudioContextFactory', () => ({
    default: {
        createRealtime: vi.fn()
    }
}));

vi.mock('../UnlockManager', () => {
    return {
        default: vi.fn().mockImplementation(function () {
            return {
                unlock: vi.fn().mockResolvedValue(undefined)
            };
        })
    };
});

describe('AudioContextManager', () => {
    let mockContext: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContext = {
            state: 'running',
            sampleRate: 48_000,
            currentTime: 1.5,
            suspend: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
            addEventListener: vi.fn()
        };

        vi.mocked(AudioContextFactory.createRealtime).mockReturnValue(mockContext);
    });

    it('should initialize correctly with default parameters', () => {
        const manager = new AudioContextManager();

        expect(AudioContextFactory.createRealtime).toHaveBeenCalledWith(undefined);
        expect(UnlockManager).toHaveBeenCalledWith(mockContext);
        expect(manager.context).toBe(mockContext);
    });

    it('should initialize with preferred sample rate', () => {
        const manager = new AudioContextManager(44_100);

        expect(AudioContextFactory.createRealtime).toHaveBeenCalledWith(44_100);
    });

    it('should expose standard getters accurately', () => {
        const manager = new AudioContextManager();

        expect(manager.state).toBe('running');
        expect(manager.sampleRate).toBe(48_000);
        expect(manager.currentTime).toBe(1.5);
    });

    it('should call unlock on resume', async () => {
        const manager = new AudioContextManager();
        const unlockerInstance = vi.mocked(UnlockManager).mock.results[0].value;

        await manager.resume();

        expect(unlockerInstance.unlock).toHaveBeenCalledTimes(1);
    });

    describe('State Change Events', () => {
        it('should register a statechange event listener on the native context', () => {
            const manager = new AudioContextManager();
            expect(mockContext.addEventListener).toHaveBeenCalledWith('statechange', expect.any(Function));
        });

        it('should trigger onStateChange callback when native context state changes', () => {
            const manager = new AudioContextManager();
            const callback = vi.fn();
            manager.onStateChange = callback;

            const listener = mockContext.addEventListener.mock.calls.find(
                (call: any[]) => call[0] === 'statechange'
            )[1];

            mockContext.state = 'suspended';
            listener();

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith('suspended');
        });

        it('should not throw if native state changes and onStateChange is null', () => {
            const manager = new AudioContextManager();

            const listener = mockContext.addEventListener.mock.calls.find(
                (call: any[]) => call[0] === 'statechange'
            )[1];

            expect(() => listener()).not.toThrow();
        });
    });

    describe('suspend()', () => {
        it('should call context.suspend() if state is running', async () => {
            mockContext.state = 'running';
            const manager = new AudioContextManager();

            await manager.suspend();

            expect(mockContext.suspend).toHaveBeenCalledTimes(1);
        });

        it('should NOT call context.suspend() if state is not running', async () => {
            mockContext.state = 'suspended';
            const manager = new AudioContextManager();

            await manager.suspend();

            expect(mockContext.suspend).not.toHaveBeenCalled();
        });
    });

    describe('close()', () => {
        it('should call context.close() if state is not closed', async () => {
            mockContext.state = 'running';
            const manager = new AudioContextManager();

            await manager.close();

            expect(mockContext.close).toHaveBeenCalledTimes(1);
        });

        it('should NOT call context.close() if state is already closed', async () => {
            mockContext.state = 'closed';
            const manager = new AudioContextManager();

            await manager.close();

            expect(mockContext.close).not.toHaveBeenCalled();
        });
    });

    describe('Spatial Audio Integration (Listener)', () => {
        let manager: AudioContextManager;
        let mockAutomation: any;
        let setPosSpy: any;
        let setOriSpy: any;

        beforeEach(() => {
            vi.clearAllMocks();
            manager = new AudioContextManager(44_100);
            mockAutomation = {};

            setPosSpy = vi.spyOn(ListenerManager.prototype, 'setPosition').mockImplementation(() => {});
            setOriSpy = vi.spyOn(ListenerManager.prototype, 'setOrientation').mockImplementation(() => {});
        });

        it('should initialize ListenerManager when initSpatial is called', () => {
            manager.initSpatial(mockAutomation);

            expect(() => manager.setListenerPosition(0, 0, 0)).not.toThrow();
            expect(setPosSpy).toHaveBeenCalledTimes(1);
        });

        it('should delegate setListenerPosition to internal ListenerManager', () => {
            manager.initSpatial(mockAutomation);
            manager.setListenerPosition(10, 20, 30);

            expect(setPosSpy).toHaveBeenCalledTimes(1);
            expect(setPosSpy).toHaveBeenCalledWith(10, 20, 30);
        });

        it('should delegate setListenerOrientation to internal ListenerManager', () => {
            manager.initSpatial(mockAutomation);
            manager.setListenerOrientation(0, 0, -1, 0, 1, 0);

            expect(setOriSpy).toHaveBeenCalledTimes(1);
            expect(setOriSpy).toHaveBeenCalledWith(0, 0, -1, 0, 1, 0);
        });

        it('should warn instead of throwing if setListenerPosition is called before initSpatial', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            manager.setListenerPosition(0, 0, 0);

            expect(warnSpy).toHaveBeenCalledWith(
                '[AudioContextManager] Spatial audio not initialized. Call initSpatial first.'
            );
            warnSpy.mockRestore();
        });

        it('should warn instead of throwing if setListenerOrientation is called before initSpatial', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            manager.setListenerOrientation(0, 0, 0, 0, 0, 0);

            expect(warnSpy).toHaveBeenCalledWith(
                '[AudioContextManager] Spatial audio not initialized. Call initSpatial first.'
            );
            warnSpy.mockRestore();
        });
    });
});
