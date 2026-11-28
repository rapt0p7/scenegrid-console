// oxlint-disable no-underscore-dangle typescript/prefer-readonly-parameter-types
// noinspection D

import type { BankId, BusId, SoundId } from '@scene-grid/shared';

import { AudioEngine } from '@application/AudioEngine.js';
import { AudioContext, registrar } from 'standardized-audio-context-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const activeIntervals = new Set<ReturnType<typeof globalThis.setInterval>>();
const activeTimeouts = new Set<ReturnType<typeof globalThis.setTimeout>>();

vi.mock('worker-timers', () => ({
    setInterval: vi.fn((cb: () => void, ms: number) => {
        const id = globalThis.setInterval(cb, ms);
        activeIntervals.add(id);
        return id;
    }),
    clearInterval: vi.fn((id: ReturnType<typeof globalThis.setInterval>) => {
        activeIntervals.delete(id);
        globalThis.clearInterval(id);
    }),
    setTimeout: vi.fn((cb: () => void, ms: number) => {
        const id = globalThis.setTimeout(cb, ms);
        activeTimeouts.add(id);
        return id;
    }),
    clearTimeout: vi.fn((id: ReturnType<typeof globalThis.setTimeout>) => {
        activeTimeouts.delete(id);
        globalThis.clearTimeout(id);
    })
}));

vi.mock('@infrastructure', async importOriginal => {
    const actual = await importOriginal<typeof import('@infrastructure')>();

    return {
        ...actual,
        AudioContextManager: vi.fn().mockImplementation(function () {
            const mockContext = new AudioContext();
            return {
                context: mockContext,
                get state() {
                    return mockContext.state;
                },
                get sampleRate() {
                    return mockContext.sampleRate;
                },
                get currentTime() {
                    return mockContext.currentTime;
                },
                onStateChange: null,
                resume: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
                suspend: vi.fn().mockResolvedValue(undefined),
                initSpatial: vi.fn(),
                setListenerPosition: vi.fn(),
                setListenerOrientation: vi.fn()
            };
        }),
        TinyLimiterNode: vi.fn().mockImplementation(function () {
            return {
                load: vi.fn().mockResolvedValue(true),
                inputNode: { connect: vi.fn() },
                outputNode: { connect: vi.fn() }
            };
        }),
        AudioBufferLoader: vi.fn().mockImplementation(function (contextManager: { context: AudioContext }) {
            const loadedBuffers = new Map<string, AudioBuffer>();
            const resolveKey = (url: string | readonly string[]) => (Array.isArray(url) ? url[0] : url);

            return {
                getBuffer: vi.fn((url: string | readonly string[]) => loadedBuffers.get(resolveKey(url))),
                purgeUrls: vi.fn((urls: Array<string | readonly string[]>) => {
                    for (const url of urls) {
                        loadedBuffers.delete(resolveKey(url));
                    }
                }),
                getCurrentRam: vi.fn().mockReturnValue(0),
                loadBatch: vi
                    .fn()
                    .mockImplementation(
                        (
                            resources: Record<string, { url: string | readonly string[] }>,
                            onProgress?: (loaded: number, total: number, lastKey: string) => void
                        ) => {
                            const entries = Object.entries(resources);
                            const results: Record<string, AudioBuffer> = {};
                            let loaded = 0;

                            for (const [key, req] of entries) {
                                const buffer = contextManager.context.createBuffer(
                                    1,
                                    4410,
                                    44100
                                ) as unknown as AudioBuffer;
                                loadedBuffers.set(resolveKey(req.url), buffer);
                                results[key] = buffer;
                                loaded++;
                                onProgress?.(loaded, entries.length, key);
                            }

                            return Promise.resolve(results);
                        }
                    )
            };
        })
    };
});

const mockMessagePort = {
    start: vi.fn(),
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn()
};

vi.stubGlobal(
    'SharedWorker',
    class SharedWorkerMock {
        public port = mockMessagePort;
    }
);

describe('MinimalRuntimeConfig (empty snapshots and events)', () => {
    let engine: AudioEngine | undefined;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        for (const id of activeIntervals) {
            globalThis.clearInterval(id);
        }
        activeIntervals.clear();

        for (const id of activeTimeouts) {
            globalThis.clearTimeout(id);
        }
        activeTimeouts.clear();

        if (engine?._debug?.contextManager?.context) {
            registrar.reset(engine._debug.contextManager.context as unknown as AudioContext);
        }
        engine = undefined;
        vi.restoreAllMocks();
    });

    it('initializes with strict validation, operates mixer/events safely, and plays bank-loaded sounds without snapshots or events', async () => {
        engine = new AudioEngine({
            manifest: {
                ['ping' as SoundId]: { url: '/audio/ping.mp3' }
            },
            buses: {
                ['master' as BusId]: { gain: 0.75 }
            },
            soundMap: {
                ['ping' as SoundId]: { busId: 'master' as BusId }
            },
            banks: {
                ['core' as BankId]: { sounds: ['ping' as SoundId] }
            },
            snapshots: {},
            events: {}
        });

        const initResult = await engine.init({ isStrictValidation: true });
        expect(initResult).toEqual({ ok: true, value: undefined });

        const masterBus = engine._debug.busSystem.getBus('master' as BusId);
        expect(masterBus).toBeDefined();
        expect(masterBus!.logicalTargetGain).toBe(0.75);
        expect(engine._debug.layerStack.getLayers()).toEqual([]);

        expect(() => {
            engine!.mixer.setState('default');
            engine!.mixer.addModifier('default', 'mod1');
            engine!.mixer.removeModifier('mod1');
        }).not.toThrow();

        expect(engine._debug.layerStack.getLayers()).toEqual([]);
        expect(masterBus!.logicalTargetGain).toBe(0.75);

        expect(() => {
            engine!.postEvent('nonexistent_event');
        }).not.toThrow();
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Event "nonexistent_event" not found in EventMap.')
        );

        const loadResult = await engine.banks.load('core');
        expect(loadResult.ok).toBe(true);
        expect(engine.banks.getState('core')).toBe('LOADED');

        const playbackId = engine.play('ping');
        expect(typeof playbackId).toBe('number');
        expect(playbackId).not.toBeNull();
    });
});
