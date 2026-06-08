/* eslint-disable @typescript-eslint/naming-convention */
// oxlint-disable unicorn/no-useless-undefined
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioContext as MockAudioContext, registrar } from 'standardized-audio-context-mock';

import SoundPoolManager from '../SoundPoolManager.js';

import type { SoundId } from '@scene-grid/shared';
import type { ISoundInstance } from '@infrastructure/types/ISoundInstance.js';
import type { IVoiceConfig } from '@infrastructure/types/IVoiceConfig.js';

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

    beforeEach(() => {
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
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        registrar.reset(mockCtx as any);
    });

    it('should pre-allocate instances in constructor', () => {
        const factory = vi.fn(id => createMockInstance(id));
        // oxlint-disable-next-line no-new
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
