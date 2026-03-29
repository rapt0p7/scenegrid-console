import { describe, it, expect, vi, beforeEach } from 'vitest';

import SoundPoolManager from '../SoundPoolManager.js';

import type { ISoundInstance } from '@webaudio-core';
import type { IVoiceConfig } from '@webaudio-core';

function createMockInstance(id: string): ISoundInstance {
    const listeners: Record<string, Array<(...arguments_: any[]) => any>> = {};
    return {
        id,
        state: 'idle',
        outputNode: {} as any,
        instanceGain: {} as any,
        currentTime: 0,
        duration: 1,
        play: vi.fn(),
        stop: vi.fn().mockImplementation(function (this: any) {
            this.state = 'stopped';
            if (listeners['ended']) {
                for (const callback of listeners['ended']) callback(this);
            }
        }),
        pause: vi.fn(),
        resume: vi.fn(),
        cancelScheduled: vi.fn(),
        resetForReuse: vi.fn().mockImplementation(function (this: any) {
            this.state = 'idle';
        }),
        setRate: vi.fn(),
        setLoop: vi.fn(),
        dispose: vi.fn(),
        on: vi.fn().mockImplementation((event: string, handler: (...arguments_: any[]) => any) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
            return () => {
                listeners[event] = listeners[event].filter(h => h !== handler);
            };
        }),

        virtualize: vi.fn().mockImplementation(function (this: any) {
            this.state = 'virtual';
        }),
        devirtualize: vi.fn().mockImplementation(function (this: any) {
            this.state = 'playing';
        })
    } as unknown as ISoundInstance;
}

describe('SoundPoolManager (Global Voice Arbiter)', () => {
    let mockConfigs: Record<string, IVoiceConfig>;
    let pool: SoundPoolManager;

    beforeEach(() => {
        mockConfigs = {
            music: { priority: 0, virtualization: 'virtualize' },
            sfx_high: { priority: 50, virtualization: 'kill' },
            sfx_low: { priority: 200, virtualization: 'kill' },
            ambient: { priority: 255, virtualization: 'virtualize' }
        };

        pool = new SoundPoolManager(soundId => createMockInstance(soundId), {
            globalVoiceLimit: 2,
            voiceConfigResolver: soundId => mockConfigs[soundId]
        });
    });

    it('should allocate new instances up to the global limit', () => {
        const inst1 = pool.acquire('sfx_high');
        const inst2 = pool.acquire('sfx_high');

        expect(inst1).toBeDefined();
        expect(inst2).toBeDefined();
        expect(pool.getActiveVoices().size).toBe(2);
    });

    it('should DROP a new sound if limit is reached and its priority is too low', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        pool.acquire('sfx_high');
        pool.acquire('sfx_high');

        const droppedInst = pool.acquire('sfx_low');

        expect(droppedInst).toBeNull();
        expect(pool.getActiveVoices().size).toBe(2);
        consoleSpy.mockRestore();
    });

    it('should STEAL a voice (Kill) from a lower priority sound', () => {
        const victim1 = pool.acquire('sfx_low')!;
        pool.acquire('sfx_low');

        (victim1 as any).state = 'playing';

        const VIP_Inst = pool.acquire('sfx_high');

        expect(VIP_Inst).toBeDefined();

        expect(victim1.stop).toHaveBeenCalled();
        expect(pool.getActiveVoices().size).toBe(2);
    });

    it('should VIRTUALIZE a voice instead of killing if config says so', () => {
        const ambientInst = pool.acquire('ambient')!;
        (ambientInst as any).state = 'playing';

        pool.acquire('sfx_high');

        const VIP_Inst = pool.acquire('sfx_high');

        expect(VIP_Inst).toBeDefined();

        expect(ambientInst.stop).not.toHaveBeenCalled();
        expect((ambientInst as any).virtualize).toHaveBeenCalled();

        expect(pool.getActiveVoices().size).toBe(3);
    });

    it('should correctly release voices back to the available pool', () => {
        const inst = pool.acquire('sfx_high')!;
        expect(pool.getActiveVoices().size).toBe(1);

        pool.release(inst);

        expect(pool.getActiveVoices().size).toBe(0);

        const instAgain = pool.acquire('sfx_high');
        expect(instAgain).toBe(inst);
        expect(instAgain?.resetForReuse).toHaveBeenCalled();
    });
});

describe('SoundPoolManager (Policy: "expand")', () => {
    let mockFactory: ReturnType<typeof vi.fn>;
    let manager: SoundPoolManager;
    let eventHandlers: Record<string, (...arguments_: any[]) => any>;

    beforeEach(() => {
        vi.clearAllMocks();
        eventHandlers = {};

        let idCounter = 0;

        mockFactory = vi.fn((soundId: string) => {
            const instanceId = `${soundId}_${++idCounter}`;
            return {
                id: soundId,
                instanceId,
                state: 'playing',
                resetForReuse: vi.fn(),
                virtualize: vi.fn(),
                on: vi.fn().mockImplementation((event, handler) => {
                    eventHandlers[instanceId] = handler;
                    return vi.fn();
                }),
                stop: vi.fn().mockImplementation(() => {
                    if (eventHandlers[instanceId]) {
                        eventHandlers[instanceId]();
                    }
                })
            } as unknown as ISoundInstance;
        });

        manager = new SoundPoolManager(mockFactory as any, {
            maxPolyphony: 2,
            globalVoiceLimit: 4,
            policy: 'expand',
            voiceConfigResolver: () => ({ priority: 128, virtualization: 'kill' })
        });
    });

    it('should bypass maxPolyphony and create new instances when policy is "expand"', () => {
        const v1 = manager.acquire('sfx_gun') as any;
        const v2 = manager.acquire('sfx_gun') as any;
        const v3 = manager.acquire('sfx_gun') as any;

        expect(mockFactory).toHaveBeenCalledTimes(3);
        expect(v1.instanceId).not.toBe(v2.instanceId);
        expect(v2.instanceId).not.toBe(v3.instanceId);
        expect(manager.getActiveVoices().size).toBe(3);
    });

    it('should respect globalVoiceLimit EVEN IF policy is "expand"', () => {
        const v1 = manager.acquire('sfx_gun') as any;
        const v2 = manager.acquire('sfx_gun') as any;
        const v3 = manager.acquire('sfx_gun') as any;
        const v4 = manager.acquire('sfx_gun') as any;
        const v5 = manager.acquire('sfx_gun') as any;

        expect(mockFactory).toHaveBeenCalledTimes(4);

        expect(v1.stop).toHaveBeenCalledTimes(1);

        expect(v5.instanceId).toBe(v1.instanceId);
        expect(v5.resetForReuse).toHaveBeenCalledTimes(1);

        expect(manager.getActiveVoices().size).toBe(4);
    });

    it('should successfully reuse released instances before expanding', () => {
        const v1 = manager.acquire('sfx_gun') as any;

        eventHandlers[v1.instanceId]();

        const v2 = manager.acquire('sfx_gun') as any;

        expect(mockFactory).toHaveBeenCalledTimes(1);
        expect(v1.instanceId).toBe(v2.instanceId);
        expect(v2.resetForReuse).toHaveBeenCalledTimes(1);
    });
});

describe('SoundPoolManager (Policy: "steal_oldest")', () => {
    let mockFactory: any;
    let manager: SoundPoolManager;

    beforeEach(() => {
        let idCounter = 0;
        mockFactory = vi.fn((soundId: string) => {
            const inst = createMockInstance(soundId);
            (inst as any).instanceId = ++idCounter;
            return inst;
        });

        manager = new SoundPoolManager(mockFactory, {
            maxPolyphony: 2,
            globalVoiceLimit: 10,
            policy: 'steal_oldest'
        });
    });

    it('should STEAL the oldest busy instance when maxPolyphony is reached for a specific sound', () => {
        const inst1 = manager.acquire('laser') as any;
        const inst2 = manager.acquire('laser') as any;

        expect(mockFactory).toHaveBeenCalledTimes(2);

        const inst3 = manager.acquire('laser') as any;

        expect(mockFactory).toHaveBeenCalledTimes(2);

        expect(inst3.instanceId).toBe(inst1.instanceId);
        expect(inst3.resetForReuse).toHaveBeenCalledTimes(1);

        expect(manager.getActiveVoices().size).toBe(2);
    });
});

describe('SoundPoolManager (Dispose)', () => {
    let mockFactory: any;
    let manager: SoundPoolManager;

    beforeEach(() => {
        mockFactory = vi.fn((soundId: string) => createMockInstance(soundId));
        manager = new SoundPoolManager(mockFactory, {
            maxPolyphony: 10,
            globalVoiceLimit: 20
        });
    });

    it('should dispose ONLY instances of the specified soundId', () => {
        const sfx1 = manager.acquire('sfx_a')!;
        const sfx2 = manager.acquire('sfx_a')!;
        const bgm = manager.acquire('bgm_b')!;

        expect(manager.getActiveVoices().size).toBe(3);

        manager.dispose('sfx_a');

        expect(sfx1.dispose).toHaveBeenCalledTimes(1);
        expect(sfx2.dispose).toHaveBeenCalledTimes(1);

        expect(bgm.dispose).not.toHaveBeenCalled();

        expect(manager.getActiveVoices().size).toBe(1);
        expect(manager.getActiveVoices().has(bgm)).toBe(true);
    });

    it('should dispose ALL instances across all soundIds if no argument is provided', () => {
        const sfx = manager.acquire('sfx_a')!;
        const bgm = manager.acquire('bgm_b')!;

        manager.release(sfx);

        manager.dispose();

        expect(sfx.dispose).toHaveBeenCalledTimes(1);
        expect(bgm.dispose).toHaveBeenCalledTimes(1);
        expect(manager.getActiveVoices().size).toBe(0);
    });
});
