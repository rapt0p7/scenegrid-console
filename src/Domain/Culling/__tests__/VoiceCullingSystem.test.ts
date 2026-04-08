import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as workerTimers from 'worker-timers';

import { VoiceCullingSystem } from '../VoiceCullingSystem.js';

import type { ISoundInstance, SoundPoolManager } from '@infrastructure';

vi.mock('worker-timers', () => ({
    setInterval: vi.fn(),
    clearInterval: vi.fn()
}));

function createMockInstance(id: string, initialState: 'playing' | 'virtual' = 'playing'): ISoundInstance {
    return {
        id,
        state: initialState,
        virtualize: vi.fn().mockImplementation(function (this: any) {
            this.state = 'virtual';
        }),
        devirtualize: vi.fn().mockImplementation(function (this: any) {
            this.state = 'playing';
        })
    } as unknown as ISoundInstance;
}

describe('VoiceCullingSystem (Background Optimizer)', () => {
    let activeVoices: Set<ISoundInstance>;
    let mockPool: Pick<SoundPoolManager, 'getActiveVoices'>;
    let mockBusVolumes: Record<string, number>;
    let mockSoundRouting: Record<string, string>;
    let cullingSystem: VoiceCullingSystem;

    beforeEach(() => {
        vi.clearAllMocks();

        activeVoices = new Set();

        mockPool = {
            getActiveVoices: () => activeVoices
        };

        mockBusVolumes = {
            music: 1,
            sfx: 1
        };

        mockSoundRouting = {
            violins: 'music',
            explosion: 'sfx'
        };

        cullingSystem = new VoiceCullingSystem(mockPool as SoundPoolManager, {
            checkIntervalMs: 500,
            cullingThreshold: 0.01,
            busIdResolver: soundId => mockSoundRouting[soundId],
            busVolumeResolver: busId => mockBusVolumes[busId] ?? 1
        });
    });

    afterEach(() => {
        cullingSystem.stop();
    });

    // eslint-disable-next-line unicorn/consistent-function-scoping
    function triggerTick(): void {
        const tickCallback = vi.mocked(workerTimers.setInterval).mock.calls[0][0] as (...arguments_: any[]) => any;
        tickCallback();
    }

    it('should properly start and stop the worker timer', () => {
        expect(workerTimers.setInterval).not.toHaveBeenCalled();

        cullingSystem.start();
        expect(workerTimers.setInterval).toHaveBeenCalledTimes(1);
        expect(workerTimers.setInterval).toHaveBeenCalledWith(expect.any(Function), 500);

        cullingSystem.start();
        expect(workerTimers.setInterval).toHaveBeenCalledTimes(1);

        cullingSystem.stop();
        expect(workerTimers.clearInterval).toHaveBeenCalledTimes(1);
    });

    it('should VIRTUALIZE a playing sound when its bus volume drops below threshold', () => {
        const violins = createMockInstance('violins', 'playing');
        activeVoices.add(violins);

        cullingSystem.start();

        mockBusVolumes['music'] = 0.005;

        triggerTick();

        expect(violins.virtualize).toHaveBeenCalledTimes(1);
        expect(violins.state).toBe('virtual');
    });

    it('should DEVIRTUALIZE a sleeping sound when its bus volume rises above threshold', () => {
        const violins = createMockInstance('violins', 'virtual');
        activeVoices.add(violins);

        cullingSystem.start();

        mockBusVolumes['music'] = 1;
        triggerTick();

        expect(violins.devirtualize).toHaveBeenCalledTimes(1);
        expect(violins.state).toBe('playing');
    });

    it('should NOT affect sounds on other buses that are still loud', () => {
        const violins = createMockInstance('violins', 'playing');
        const explosion = createMockInstance('explosion', 'playing');

        activeVoices.add(violins);
        activeVoices.add(explosion);

        cullingSystem.start();

        mockBusVolumes['music'] = 0;
        mockBusVolumes['sfx'] = 1;

        triggerTick();

        expect(violins.virtualize).toHaveBeenCalled();
        expect(violins.state).toBe('virtual');

        expect(explosion.virtualize).not.toHaveBeenCalled();
        expect(explosion.state).toBe('playing');
    });

    it('should do nothing if sound state and volume already match', () => {
        const violins = createMockInstance('violins', 'playing');
        activeVoices.add(violins);

        cullingSystem.start();

        triggerTick();

        expect(violins.virtualize).not.toHaveBeenCalled();
        expect(violins.devirtualize).not.toHaveBeenCalled();
    });
    it('should call onRevive hook when a voice is devirtualized', () => {
        const mockRevive = vi.fn();
        const mockInstance = {
            id: 'test_sound',
            state: 'virtual',
            devirtualize: vi.fn(),
            onRevive: mockRevive
        };

        const localMockPool = {
            getActiveVoices: vi.fn().mockReturnValue([mockInstance])
        } as any;
        const localMockConfig = {
            checkIntervalMs: 500,
            cullingThreshold: 0.01,
            busIdResolver: vi.fn().mockReturnValue('master'),
            busVolumeResolver: vi.fn().mockReturnValue(0.8)
        };

        const localSystem = new VoiceCullingSystem(localMockPool, localMockConfig);

        (localSystem as any).tick();

        expect(mockInstance.devirtualize).toHaveBeenCalledTimes(1);
        expect(mockRevive).toHaveBeenCalledWith(mockInstance);
    });
});
