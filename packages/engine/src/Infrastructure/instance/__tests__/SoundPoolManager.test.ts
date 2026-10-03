import type { ISoundInstance } from '@infrastructure/types/ISoundInstance.js';
import type { IVoiceConfig } from '@infrastructure/types/IVoiceConfig.js';
import type { SoundId } from '@scene-grid/shared';

import { AudioContext as MockAudioContext, registrar } from 'standardized-audio-context-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import SoundPoolManager from '../SoundPoolManager.js';

function createMockInstance(initialId: string): ISoundInstance {
    const listeners: Record<string, Array<(...arguments_: any[]) => any>> = {};
    let currentId = initialId;
    let isLooping = false;

    return {
        get id() {
            return currentId;
        },
        get isLooping() {
            return isLooping;
        },
        _poolIndex: -1,
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
        rebind: vi.fn().mockImplementation((newId: string, _buffer: AudioBuffer) => {
            currentId = newId;
        }),
        resetForReuse: vi.fn().mockImplementation(function (this: any) {
            this.state = 'idle';
            isLooping = false;
        }),
        setRate: vi.fn(),
        setLoop: vi.fn().mockImplementation((val: boolean) => {
            isLooping = val;
        }),
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
    let mockCtx: MockAudioContext;
    let mockConfigs: Record<string, IVoiceConfig>;
    let pool: SoundPoolManager;
    let fakeBuffer: AudioBuffer;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockCtx = new MockAudioContext();
        fakeBuffer = mockCtx.createBuffer(2, 44100, 44100) as unknown as AudioBuffer;

        mockConfigs = {
            music: { priority: 0, virtualization: 'virtualize' },
            sfx_high: { priority: 50, virtualization: 'kill' },
            sfx_low: { priority: 200, virtualization: 'kill' },
            ambient: { priority: 255, virtualization: 'virtualize' }
        };

        pool = new SoundPoolManager(soundId => createMockInstance(soundId), {
            globalVoiceLimit: 2,
            maxPolyphony: 32,
            policy: 'steal_oldest',
            voiceConfigResolver: soundId => mockConfigs[soundId]
        });
    });

    afterEach(() => {
        warnSpy.mockRestore();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        registrar.reset(mockCtx as any);
    });

    it('should pre-allocate instances in constructor', () => {
        const factory = vi.fn(id => createMockInstance(id));
        new SoundPoolManager(factory, {
            globalVoiceLimit: 5,
            maxPolyphony: 32,
            policy: 'steal_oldest',
            voiceConfigResolver: () => undefined
        });
        expect(factory).toHaveBeenCalledTimes(5);
        expect(factory).toHaveBeenCalledWith('__RESERVED__');
    });

    it('should allocate existing instances from pool up to the global limit', () => {
        const inst1 = pool.acquire('sfx_high' as SoundId, fakeBuffer);
        const inst2 = pool.acquire('sfx_high' as SoundId, fakeBuffer);

        expect(inst1).toBeDefined();
        expect(inst2).toBeDefined();
        expect(pool.getActiveVoices().length).toBe(2);
    });

    it('should DROP a new sound if limit is reached and its priority is too low', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        pool.acquire('sfx_high' as SoundId, fakeBuffer);
        pool.acquire('sfx_high' as SoundId, fakeBuffer);

        const droppedInst = pool.acquire('sfx_low' as SoundId, fakeBuffer);

        expect(droppedInst).toEqual('PRIORITY_STEAL_FAILED');
        expect(pool.getActiveVoices().length).toBe(2);
        consoleSpy.mockRestore();
    });

    it('should STEAL a voice (Kill) from a lower priority sound', () => {
        const victim1 = pool.acquire('sfx_low' as SoundId, fakeBuffer) as ISoundInstance;
        pool.acquire('sfx_low' as SoundId, fakeBuffer);

        (victim1 as any).state = 'playing';

        const VIP_Inst = pool.acquire('sfx_high' as SoundId, fakeBuffer);

        expect(typeof VIP_Inst).not.toBe('string');
        expect(victim1.stop).toHaveBeenCalled();
        expect(pool.getActiveVoices().length).toBe(2);
    });

    it('should correctly release voices back to the stack', () => {
        const inst = pool.acquire('sfx_high' as SoundId, fakeBuffer) as ISoundInstance;
        expect(pool.getActiveVoices().length).toBe(1);

        pool.release(inst);
        expect(pool.getActiveVoices().length).toBe(0);

        const instAgain = pool.acquire('sfx_high' as SoundId, fakeBuffer) as ISoundInstance;
        expect(instAgain).toBe(inst);
        expect(instAgain.rebind).toHaveBeenCalledWith('sfx_high', fakeBuffer, undefined);
        expect(instAgain.resetForReuse).toHaveBeenCalled();
    });

    describe('SoundPoolManager (Edge Cases & Purge)', () => {
        beforeEach(() => {
            pool = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 3
            });
            fakeBuffer = {} as AudioBuffer;
        });

        it('should correctly report globalVoiceLimit', () => {
            expect(pool.globalVoiceLimit).toBe(3);
        });

        it('should purge sound correctly', () => {
            const inst1 = pool.acquire('test' as SoundId, fakeBuffer) as ISoundInstance;
            const inst2 = pool.acquire('other' as SoundId, fakeBuffer) as ISoundInstance;

            pool.purgeSound('test' as SoundId);

            expect(inst1.stop).toHaveBeenCalled();
            expect(inst1.rebind).toHaveBeenCalledWith('__RESERVED__', null as any);

            expect(inst2.stop).not.toHaveBeenCalled();
            expect(pool.getActiveVoices()).toContain(inst2);
            expect(pool.getActiveVoices()).not.toContain(inst1);
        });

        it('should skip virtual instances during priority stealing', () => {
            const configs: Record<string, IVoiceConfig> = {
                low_prio: { priority: 200 },
                high_prio: { priority: 50 },
                new_sound: { priority: 50 }
            };

            pool = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 2,
                voiceConfigResolver: id => configs[id]
            });

            const inst1 = pool.acquire('low_prio' as SoundId, fakeBuffer) as any;
            inst1.state = 'playing';

            const inst2 = pool.acquire('high_prio' as SoundId, fakeBuffer) as any;
            inst2.state = 'virtual';

            // oxlint-disable-next-line no-unused-vars
            const inst3 = pool.acquire('new_sound' as SoundId, fakeBuffer);

            expect(inst1.stop).toHaveBeenCalled();
            expect(inst2.stop).not.toHaveBeenCalled();
            expect(inst2.state).toBe('virtual');
        });

        it('should pre-allocate all instances to globalVoiceLimit length during initialization', () => {
            const factory = vi.fn((id: string) => createMockInstance(id));

            const poolManager = new SoundPoolManager(factory, { globalVoiceLimit: 5 });

            expect(factory).toHaveBeenCalledTimes(5);
            expect(poolManager.globalVoiceLimit).toBe(5);
        });

        it('should default policy to "steal_oldest" when policy option is omitted', () => {
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                maxPolyphony: 2,
                globalVoiceLimit: 10
            });
            manager.acquire('laser' as SoundId, fakeBuffer);
            manager.acquire('laser' as SoundId, fakeBuffer);

            const inst3 = manager.acquire('laser' as SoundId, fakeBuffer);

            expect(inst3).not.toBe('MAX_POLYPHONY');
            expect(typeof inst3).toBe('object');
        });

        it('should use configured priority value instead of masking it with 128 during acquire', () => {
            const configs: Record<string, IVoiceConfig> = {
                sfx_high: { priority: 50 },
                sfx_mid: { priority: 100 }
            };
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 1,
                voiceConfigResolver: id => configs[id]
            });
            manager.acquire('sfx_mid' as SoundId, fakeBuffer);

            const vipInst = manager.acquire('sfx_high' as SoundId, fakeBuffer);

            expect(vipInst).not.toBe('PRIORITY_STEAL_FAILED');
            expect(typeof vipInst).toBe('object');
        });

        it('should log warning message when priority steal fails', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const customPool = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 1,
                voiceConfigResolver: id => (id === 'sfx_high' ? { priority: 10 } : { priority: 200 })
            });

            customPool.acquire('sfx_high' as SoundId, fakeBuffer);

            const result = customPool.acquire('sfx_low' as SoundId, fakeBuffer);

            expect(result).toBe('PRIORITY_STEAL_FAILED');
            expect(consoleSpy).toHaveBeenCalledWith('[Pool] Rejected "sfx_low": No victims with lower priority.');

            consoleSpy.mockRestore();
        });

        it('should automatically release instance when "ended" event fires', () => {
            const inst = pool.acquire('sfx_high' as SoundId, fakeBuffer) as ISoundInstance;
            expect(pool.getActiveVoices().length).toBe(1);

            inst.stop();

            expect(pool.getActiveVoices().length).toBe(0);
        });

        it('should emit "released" event on pool events emitter when an instance is released', () => {
            const releasedListener = vi.fn();
            pool.events.on('released', releasedListener);
            const inst = pool.acquire('sfx_high' as SoundId, fakeBuffer) as ISoundInstance;

            pool.release(inst);

            expect(releasedListener).toHaveBeenCalledTimes(1);
            expect(releasedListener).toHaveBeenCalledWith(inst);
        });

        it('should not rebind instances of other soundIds when purging a specific soundId', () => {
            // oxlint-disable-next-line no-unused-vars
            const inst1 = pool.acquire('test' as SoundId, fakeBuffer) as ISoundInstance;
            const inst2 = pool.acquire('other' as SoundId, fakeBuffer) as ISoundInstance;

            pool.purgeSound('test' as SoundId);

            expect(inst2.id).toBe('other');
            expect(inst2.rebind).not.toHaveBeenCalledWith('__RESERVED__', expect.anything());
        });

        it('should set stackPtr to -1 on full dispose so subsequent acquire calls fail when pool is empty', () => {
            pool.acquire('sfx_high' as SoundId, fakeBuffer);
            pool.dispose();

            const result = pool.acquire('sfx_high' as SoundId, fakeBuffer);

            expect(result).toBe('PRIORITY_STEAL_FAILED');
        });

        it('should select the instance with the weakest priority value among active instances', () => {
            const configs: Record<string, IVoiceConfig> = {
                sfx_mid: { priority: 100 },
                sfx_low: { priority: 200 },
                sfx_high: { priority: 50 }
            };
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 2,
                voiceConfigResolver: id => configs[id]
            });
            const midInst = manager.acquire('sfx_mid' as SoundId, fakeBuffer) as ISoundInstance;
            const lowInst = manager.acquire('sfx_low' as SoundId, fakeBuffer) as ISoundInstance;

            manager.acquire('sfx_high' as SoundId, fakeBuffer);

            expect(lowInst.stop).toHaveBeenCalled();
            expect(midInst.stop).not.toHaveBeenCalled();
        });

        it('should fallback to default priority 128 without throwing when active instance has no voice config', () => {
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 1,
                voiceConfigResolver: () => undefined
            });
            manager.acquire('unconfigured_sound' as SoundId, fakeBuffer);

            expect(() => {
                manager.acquire('new_sound' as SoundId, fakeBuffer);
            }).not.toThrow();
        });

        it('should only count active instances matching the specific soundId for maxPolyphony check', () => {
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                maxPolyphony: 2,
                globalVoiceLimit: 10,
                policy: 'steal_oldest',
                voiceConfigResolver: () => ({ priority: 128 })
            });
            const soundA1 = manager.acquire('soundA' as SoundId, fakeBuffer) as ISoundInstance;
            const soundA2 = manager.acquire('soundA' as SoundId, fakeBuffer) as ISoundInstance;

            const soundB = manager.acquire('soundB' as SoundId, fakeBuffer) as ISoundInstance;

            expect(typeof soundB).toBe('object');
            expect(soundA1.stop).not.toHaveBeenCalled();
            expect(soundA2.stop).not.toHaveBeenCalled();
            expect(manager.getActiveVoices().length).toBe(3);
        });

        it('should correctly select active instances with priority 0 during candidate search', () => {
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 1,
                voiceConfigResolver: () => ({ priority: 0 })
            });
            const inst1 = manager.acquire('sound_zero' as SoundId, fakeBuffer) as ISoundInstance;

            const inst2 = manager.acquire('sound_zero2' as SoundId, fakeBuffer);

            expect(inst2).not.toBe('PRIORITY_STEAL_FAILED');
            expect(inst1.stop).toHaveBeenCalled();
        });

        it('should correctly select active loop instances with priority 0 during candidate search', () => {
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 1,
                voiceConfigResolver: () => ({ priority: 0 })
            });
            const loopInst = manager.acquire('loop_zero' as SoundId, fakeBuffer) as ISoundInstance;
            loopInst.setLoop(true);

            const nextInst = manager.acquire('sound_zero2' as SoundId, fakeBuffer);

            expect(nextInst).not.toBe('PRIORITY_STEAL_FAILED');
            expect(loopInst.stop).toHaveBeenCalled();
        });

        it('should skip virtual instances during priority stealing even if virtual instance has weaker priority', () => {
            const configs: Record<string, IVoiceConfig> = {
                high_prio: { priority: 50 },
                low_prio_virtual: { priority: 200 },
                new_sound: { priority: 50 }
            };
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 2,
                voiceConfigResolver: id => configs[id]
            });

            const playingInst = manager.acquire('high_prio' as SoundId, fakeBuffer) as ISoundInstance;
            (playingInst as any).state = 'playing';

            const virtualInst = manager.acquire('low_prio_virtual' as SoundId, fakeBuffer) as ISoundInstance;
            (virtualInst as any).state = 'virtual';

            manager.acquire('new_sound' as SoundId, fakeBuffer);

            expect(virtualInst.stop).not.toHaveBeenCalled();
            expect(playingInst.stop).toHaveBeenCalled();
        });

        it('should steal the weakest loop instance when multiple loops with different priorities exist', () => {
            const configs: Record<string, IVoiceConfig> = {
                mid_loop: { priority: 100 },
                low_loop: { priority: 200 },
                new_sound: { priority: 50 }
            };
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 2,
                voiceConfigResolver: id => configs[id]
            });
            const midLoop = manager.acquire('mid_loop' as SoundId, fakeBuffer) as ISoundInstance;
            midLoop.setLoop(true);

            const lowLoop = manager.acquire('low_loop' as SoundId, fakeBuffer) as ISoundInstance;
            lowLoop.setLoop(true);

            manager.acquire('new_sound' as SoundId, fakeBuffer);

            expect(lowLoop.stop).toHaveBeenCalled();
            expect(midLoop.stop).not.toHaveBeenCalled();
        });

        it('should steal the oldest loop instance when multiple loop instances have identical priorities', () => {
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 2,
                voiceConfigResolver: () => ({ priority: 200 })
            });
            const oldLoop = manager.acquire('loop_a' as SoundId, fakeBuffer) as ISoundInstance;
            oldLoop.setLoop(true);

            const newLoop = manager.acquire('loop_b' as SoundId, fakeBuffer) as ISoundInstance;
            newLoop.setLoop(true);

            manager.acquire('new_sound' as SoundId, fakeBuffer);

            expect(oldLoop.stop).toHaveBeenCalled();
            expect(newLoop.stop).not.toHaveBeenCalled();
        });

        it('should steal an active non-loop instance when active priority equals requested priority', () => {
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 1,
                voiceConfigResolver: () => ({ priority: 128 })
            });
            manager.acquire('sound1' as SoundId, fakeBuffer);

            const result = manager.acquire('sound2' as SoundId, fakeBuffer);

            expect(result).not.toBe('PRIORITY_STEAL_FAILED');
            expect(typeof result).toBe('object');
        });

        it('should not steal a loop instance if loop priority is stronger than requested priority', () => {
            const configs: Record<string, IVoiceConfig> = {
                high_prio_loop: { priority: 10 },
                low_prio_requested: { priority: 50 }
            };
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 1,
                voiceConfigResolver: id => configs[id]
            });
            const loopInst = manager.acquire('high_prio_loop' as SoundId, fakeBuffer) as ISoundInstance;
            loopInst.setLoop(true);

            const result = manager.acquire('low_prio_requested' as SoundId, fakeBuffer);

            expect(result).toBe('PRIORITY_STEAL_FAILED');
            expect(loopInst.stop).not.toHaveBeenCalled();
        });

        it('should steal an active loop instance when active loop priority equals requested priority', () => {
            const manager = new SoundPoolManager(soundId => createMockInstance(soundId), {
                globalVoiceLimit: 1,
                voiceConfigResolver: () => ({ priority: 128 })
            });
            const loopInst = manager.acquire('loop1' as SoundId, fakeBuffer) as ISoundInstance;
            loopInst.setLoop(true);

            const result = manager.acquire('sound2' as SoundId, fakeBuffer);

            expect(result).not.toBe('PRIORITY_STEAL_FAILED');
            expect(typeof result).toBe('object');
        });
    });
});

describe('SoundPoolManager (Loop Stealing Immunity)', () => {
    let mockCtx: MockAudioContext;
    let mockConfigs: Record<string, IVoiceConfig>;
    let pool: SoundPoolManager;
    let fakeBuffer: AudioBuffer;

    beforeEach(() => {
        mockCtx = new MockAudioContext();
        fakeBuffer = mockCtx.createBuffer(2, 44100, 44100) as unknown as AudioBuffer;
        mockConfigs = {
            sfx_high: { priority: 50, virtualization: 'kill' },
            sfx_low: { priority: 200, virtualization: 'kill' },
            ambient: { priority: 255, virtualization: 'virtualize' }
        };

        pool = new SoundPoolManager(soundId => createMockInstance(soundId), {
            globalVoiceLimit: 2,
            maxPolyphony: 32,
            policy: 'steal_oldest',
            voiceConfigResolver: soundId => mockConfigs[soundId]
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        registrar.reset(mockCtx as any);
    });

    it('should PREFER stealing from one-shots over loops, even if the loop has a weaker priority', () => {
        const ambientInst = pool.acquire('ambient' as SoundId, fakeBuffer) as ISoundInstance;
        ambientInst.setLoop(true);
        (ambientInst as any).state = 'playing';

        const sfxLowInst = pool.acquire('sfx_low' as SoundId, fakeBuffer) as ISoundInstance;
        sfxLowInst.setLoop(false);
        (sfxLowInst as any).state = 'playing';

        const vipInst = pool.acquire('sfx_high' as SoundId, fakeBuffer);

        expect(typeof vipInst).not.toBe('string');

        expect(sfxLowInst.stop).toHaveBeenCalled();
        expect(ambientInst.stop).not.toHaveBeenCalled();
    });

    it('should steal a loop ONLY if no vulnerable one-shots are available', () => {
        const ambient1 = pool.acquire('ambient' as SoundId, fakeBuffer) as ISoundInstance;
        ambient1.setLoop(true);
        (ambient1 as any).state = 'playing';

        const ambient2 = pool.acquire('ambient' as SoundId, fakeBuffer) as ISoundInstance;
        ambient2.setLoop(true);
        (ambient2 as any).state = 'playing';

        const vipInst = pool.acquire('sfx_high' as SoundId, fakeBuffer);

        expect(typeof vipInst).not.toBe('string');

        const loop1Stopped = (ambient1.stop as any).mock.calls.length > 0;
        const loop2Stopped = (ambient2.stop as any).mock.calls.length > 0;

        expect(loop1Stopped || loop2Stopped).toBe(true);
    });
});

describe('SoundPoolManager (Policy Logic)', () => {
    let mockCtx: MockAudioContext;
    let mockFactory: any;
    let manager: SoundPoolManager;
    let fakeBuffer: AudioBuffer;

    beforeEach(() => {
        mockCtx = new MockAudioContext();
        fakeBuffer = mockCtx.createBuffer(2, 44100, 44100) as unknown as AudioBuffer;

        let idCounter = 0;
        mockFactory = vi.fn((soundId: string) => {
            const inst = createMockInstance(soundId);
            (inst as any).instanceId = ++idCounter;
            return inst;
        });

        manager = new SoundPoolManager(mockFactory, {
            maxPolyphony: 2,
            globalVoiceLimit: 10,
            policy: 'steal_oldest',
            voiceConfigResolver: () => ({ priority: 128, virtualization: 'kill' })
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        registrar.reset(mockCtx as any);
    });

    it('should STEAL the oldest busy instance when maxPolyphony is reached', () => {
        const inst1 = manager.acquire('laser' as SoundId, fakeBuffer) as any;
        manager.acquire('laser' as SoundId, fakeBuffer);

        const inst3 = manager.acquire('laser' as SoundId, fakeBuffer) as any;

        expect(inst3.instanceId).toBe(inst1.instanceId);
        expect(inst3.rebind).toHaveBeenCalledWith('laser', fakeBuffer, undefined);

        expect(inst3.resetForReuse).toHaveBeenCalledTimes(2);
        expect(manager.getActiveVoices().length).toBe(2);
    });

    it('should return literal "MAX_POLYPHONY" if max polyphony is reached and policy rejects stealing', () => {
        const strictManager = new SoundPoolManager(mockFactory, {
            maxPolyphony: 2,
            globalVoiceLimit: 10,
            policy: 'expand',
            voiceConfigResolver: () => ({ priority: 128, virtualization: 'kill' })
        });

        strictManager.acquire('laser' as SoundId, fakeBuffer);
        strictManager.acquire('laser' as SoundId, fakeBuffer);

        const result = strictManager.acquire('laser' as SoundId, fakeBuffer);

        expect(result).toBe('MAX_POLYPHONY');
        expect(strictManager.getActiveVoices().length).toBe(2);
    });
});

describe('SoundPoolManager (Dispose)', () => {
    let mockCtx: MockAudioContext;
    let mockFactory: any;
    let manager: SoundPoolManager;
    let fakeBuffer: AudioBuffer;

    beforeEach(() => {
        mockCtx = new MockAudioContext();
        fakeBuffer = mockCtx.createBuffer(2, 44100, 44100) as unknown as AudioBuffer;

        mockFactory = vi.fn((soundId: string) => createMockInstance(soundId));
        manager = new SoundPoolManager(mockFactory, {
            maxPolyphony: 10,
            globalVoiceLimit: 20,
            policy: 'steal_oldest',
            voiceConfigResolver: () => undefined
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        registrar.reset(mockCtx as any);
    });

    it('should dispose ONLY instances of the specified soundId', () => {
        const sfx1 = manager.acquire('sfx_a' as SoundId, fakeBuffer) as ISoundInstance;
        const sfx2 = manager.acquire('sfx_a' as SoundId, fakeBuffer) as ISoundInstance;
        const bgm = manager.acquire('bgm_b' as SoundId, fakeBuffer) as ISoundInstance;

        expect(manager.getActiveVoices().length).toBe(3);

        manager.dispose('sfx_a' as SoundId);

        expect(sfx1.stop).toHaveBeenCalled();
        expect(sfx2.stop).toHaveBeenCalled();
        expect(bgm.stop).not.toHaveBeenCalled();

        expect(manager.getActiveVoices().length).toBe(1);
    });

    it('should dispose ALL instances across all soundIds if no argument is provided', () => {
        const sfx = manager.acquire('sfx_a' as SoundId, fakeBuffer) as ISoundInstance;
        const bgm = manager.acquire('bgm_b' as SoundId, fakeBuffer) as ISoundInstance;

        manager.dispose();

        expect(sfx.dispose).toHaveBeenCalledTimes(1);
        expect(bgm.dispose).toHaveBeenCalledTimes(1);
        expect(manager.getActiveVoices().length).toBe(0);
    });
});
