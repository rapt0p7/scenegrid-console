// oxlint-disable max-lines max-lines-per-function typescript/prefer-readonly-parameter-types no-underscore-dangle
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockTweakpaneState = vi.hoisted(() => ({
    panes: [] as any[],
    withTitleElements: true,
    withFolderContent: true
}));

interface IMockBindingRecord {
    readonly target: Record<string, any>;
    readonly key: string;
    readonly opts: Record<string, any>;
    readonly changeListeners: Array<(event: { value: any }) => void>;
    options: any;
    triggerChangeOnRefresh: boolean;
    readonly refresh: ReturnType<typeof vi.fn>;
    on(event: string, cb: (ev: { value: any }) => void): IMockBindingRecord;
    emitChange(value: any): void;
}

interface IMockButtonRecord {
    readonly title: string;
    readonly element: HTMLElement;
    readonly clickListeners: Array<() => void>;
    on(event: string, cb: () => void): IMockButtonRecord;
    click(): void;
}

interface IMockFolderRecord {
    readonly title: string;
    readonly element: HTMLElement;
    readonly folders: IMockFolderRecord[];
    readonly bindings: IMockBindingRecord[];
    readonly buttons: IMockButtonRecord[];
    readonly blades: any[];
    readonly refresh: ReturnType<typeof vi.fn>;
    addFolder(opts: { title: string; expanded?: boolean }): IMockFolderRecord;
    addBinding(target: Record<string, any>, key: string, opts?: Record<string, any>): IMockBindingRecord;
    addButton(opts: { title: string }): IMockButtonRecord;
    addBlade(opts: Record<string, any>): void;
}

vi.mock('@tweakpane/plugin-essentials', () => ({
    id: 'essentials-plugin'
}));

vi.mock('tweakpane', () => {
    const createTitleElement = (className: string): HTMLElement => {
        const el = document.createElement('div');
        if (mockTweakpaneState.withTitleElements) {
            const titleEl = document.createElement('span');
            titleEl.className = className;
            el.append(titleEl);
        }
        return el;
    };

    const createFolder = (title: string): IMockFolderRecord => {
        const element = createTitleElement('tp-fldv_t');
        if (mockTweakpaneState.withFolderContent) {
            const content = document.createElement('div');
            content.className = 'tp-fldv_c';
            element.append(content);
        }

        const folder: IMockFolderRecord = {
            title,
            element,
            folders: [],
            bindings: [],
            buttons: [],
            blades: [],
            refresh: vi.fn(),
            addFolder(opts) {
                const sub = createFolder(opts.title);
                folder.folders.push(sub);
                return sub;
            },
            addBinding(target, key, opts = {}) {
                const binding: IMockBindingRecord = {
                    target,
                    key,
                    opts,
                    options: opts.options,
                    changeListeners: [],
                    triggerChangeOnRefresh: false,
                    refresh: vi.fn(() => {
                        if (binding.triggerChangeOnRefresh) {
                            for (const cb of binding.changeListeners) {
                                cb({ value: target[key] });
                            }
                        }
                    }),
                    on(event, cb) {
                        if (event === 'change') {
                            binding.changeListeners.push(cb);
                        }
                        return binding;
                    },
                    emitChange(value) {
                        target[key] = value;
                        for (const cb of binding.changeListeners) {
                            cb({ value });
                        }
                    }
                };
                folder.bindings.push(binding);
                return binding;
            },
            addButton(opts) {
                const btn: IMockButtonRecord = {
                    title: opts.title,
                    element: createTitleElement('tp-btnv_t'),
                    clickListeners: [],
                    on(event, cb) {
                        if (event === 'click') {
                            btn.clickListeners.push(cb);
                        }
                        return btn;
                    },
                    click() {
                        for (const cb of btn.clickListeners) {
                            cb();
                        }
                    }
                };
                folder.buttons.push(btn);
                return btn;
            },
            addBlade(opts) {
                folder.blades.push(opts);
            }
        };

        return folder;
    };

    class MockPane {
        public hidden = false;
        public readonly element: HTMLElement;
        public readonly folders: IMockFolderRecord[] = [];
        public readonly registerPlugin = vi.fn();
        public readonly refresh = vi.fn();

        constructor(_opts: { title: string; expanded?: boolean }) {
            this.element = createTitleElement('tp-rotv_t');
            mockTweakpaneState.panes.push(this);
        }

        addFolder(opts: { title: string; expanded?: boolean }): IMockFolderRecord {
            const folder = createFolder(opts.title);
            this.folders.push(folder);
            return folder;
        }
    }

    return {
        Pane: MockPane,
        FolderApi: () => ({})
    };
});

import { initAudioDebugPanel, isSfxSound } from '../AudioDebugPanel.js';

function findFolder(pane: { folders: IMockFolderRecord[] }, title: string): IMockFolderRecord {
    const queue = [...pane.folders];
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.title === title) return current;
        queue.push(...current.folders);
    }
    throw new Error(`Folder "${title}" not found`);
}

function findButton(pane: { folders: IMockFolderRecord[] }, title: string): IMockButtonRecord {
    const queue = [...pane.folders];
    while (queue.length > 0) {
        const current = queue.shift()!;
        const match = current.buttons.find(b => b.title === title);
        if (match) return match;
        queue.push(...current.folders);
    }
    throw new Error(`Button "${title}" not found`);
}

describe('isSfxSound', () => {
    it('returns true for leaf sounds routed to any bus containing sfx (case-insensitive)', () => {
        const soundMap = {
            kick: { busId: 'sfx' },
            coins: { busId: 'SFX_COINS' },
            ambience: { busId: 'World_Sfx_Env' },
            bgm: { busId: 'musicMain' },
            numericBus: { busId: 123 }
        };

        expect(isSfxSound(soundMap, 'kick')).toBe(true);
        expect(isSfxSound(soundMap, 'coins')).toBe(true);
        expect(isSfxSound(soundMap, 'ambience')).toBe(true);
        expect(isSfxSound(soundMap, 'bgm')).toBe(false);
        expect(isSfxSound(soundMap, 'numericBus')).toBe(false);
    });

    it('returns true for scatterer sounds when any source maps to an sfx bus', () => {
        const soundMap = {
            tick: { busId: 'sfx' },
            pad: { busId: 'musicLounge' },
            coin: { busId: 'SFX_COINS' },
            stringScatterer: {
                isScatterer: true,
                sources: ['pad', 'tick']
            },
            weightedScatterer: {
                isScatterer: true,
                sources: [{ id: 'coin', weight: 2 }]
            }
        };

        expect(isSfxSound(soundMap, 'stringScatterer')).toBe(true);
        expect(isSfxSound(soundMap, 'weightedScatterer')).toBe(true);
    });

    it('returns false for scatterers with non-sfx sources, malformed sources, missing entries, or cycles', () => {
        const soundMap = {
            pad: { busId: 'musicMain' },
            nonArrayScatterer: {
                isScatterer: true,
                sources: 'invalid'
            },
            malformedItemScatterer: {
                isScatterer: true,
                sources: [null, { id: 99 }, 'missing_sound']
            },
            musicScatterer: {
                isScatterer: true,
                sources: ['pad', { id: 'missing_sound', weight: 1 }]
            },
            cycleA: {
                isScatterer: true,
                sources: ['cycleB']
            },
            cycleB: {
                isScatterer: true,
                sources: ['cycleA']
            }
        };

        expect(isSfxSound(soundMap, 'nonArrayScatterer')).toBe(false);
        expect(isSfxSound(soundMap, 'malformedItemScatterer')).toBe(false);
        expect(isSfxSound(soundMap, 'musicScatterer')).toBe(false);
        expect(isSfxSound(soundMap, 'cycleA')).toBe(false);
        expect(isSfxSound(soundMap, 'doesNotExist')).toBe(false);
        expect(isSfxSound(undefined, 'anything')).toBe(false);
    });
});

describe('initAudioDebugPanel', () => {
    let rafQueue: FrameRequestCallback[];
    let registeredKeydownListeners: Array<(e: KeyboardEvent) => void>;
    let origAddEventListener: typeof document.addEventListener;

    const flushRafOnce = () => {
        const pending = rafQueue.splice(0);
        for (const cb of pending) {
            cb(16);
        }
    };

    const createFullEngine = (overrides: Partial<any> = {}) => {
        const paramToIndex = new Map([['intensity', 0]]);
        const rtpcValues = new Map([['intensity', 0.25]]);

        return {
            play: vi.fn().mockReturnValue(101),
            mixer: {
                setState: vi.fn(),
                removeModifier: vi.fn()
            },
            spatial: {
                setSoundPosition: vi.fn()
            },
            music: {
                playLoop: vi.fn(),
                stopLoop: vi.fn(),
                transitionTo: vi.fn()
            },
            _debug: {
                masterOutput: {
                    mute: vi.fn(),
                    unmute: vi.fn(),
                    setVolume: vi.fn()
                },
                busSystem: {
                    getCurrentRealGain: vi.fn((busId: string) => (busId === 'sfx' ? 0.75 : undefined)),
                    getAllBuses: () =>
                        new Map([
                            ['sfx', { targetParams: { gain: { logical: 1, rtpc: 0.75 } }, logicalTargetGain: 0.75 }]
                        ]),
                    sidechains: new Map<string, any>([['music', {}]]),
                    getSidechain: vi.fn((busId: string) => (busId === 'music' ? { activeEnvelope: 0.42 } : undefined))
                },
                rtpcManager: {
                    paramToIndex,
                    getValue: vi.fn((key: string) => rtpcValues.get(key) ?? 0),
                    setValue: vi.fn((key: string, val: number) => {
                        rtpcValues.set(key, val);
                    })
                },
                router: {
                    soundController: {
                        activeVoices: new Map([
                            [1, { playbackId: 1, soundId: 'gun_shot', physicalInstance: { state: 'playing' } }]
                        ]),
                        getPlaybackState: () => 'playing',
                        getSoundId: () => 'gun_shot',
                        isGhostVoice: () => false
                    }
                },
                config: {
                    globalVoiceLimit: 16,
                    buses: { master: {}, sfx: {}, music: {} },
                    snapshots: { combat_mode: {}, idle: {} },
                    soundMap: {
                        gun_shot: { busId: 'sfx', spatial: true },
                        coin_ping: { busId: 'SFX_COINS', hasPanner: true },
                        bgm_loop: {
                            busId: 'music',
                            smartLoop: {
                                regions: {
                                    A: [0, 1000],
                                    B: [1000, 2000]
                                }
                            }
                        },
                        empty_loop: {
                            busId: 'music',
                            smartLoop: {
                                regions: {}
                            }
                        }
                    }
                }
            },
            ...overrides
        };
    };

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        mockTweakpaneState.panes = [];
        mockTweakpaneState.withTitleElements = true;
        mockTweakpaneState.withFolderContent = true;
        delete (globalThis as any).AudioEngine;

        rafQueue = [];
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafQueue.push(cb);
            return rafQueue.length;
        });

        registeredKeydownListeners = [];
        origAddEventListener = document.addEventListener.bind(document);
        vi.spyOn(document, 'addEventListener').mockImplementation((type: string, listener: any, options?: any) => {
            if (type === 'keydown' && typeof listener === 'function') {
                registeredKeydownListeners.push(listener);
            }
            origAddEventListener(type, listener, options);
        });
    });

    afterEach(() => {
        for (const listener of registeredKeydownListeners) {
            document.removeEventListener('keydown', listener);
        }
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete (globalThis as any).AudioEngine;
    });

    it('warns and returns early when no AudioEngine instance is provided or attached to window', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        initAudioDebugPanel();

        expect(warnSpy).toHaveBeenCalledWith('[Debug] AudioEngine is not available.');
        expect(mockTweakpaneState.panes).toHaveLength(0);
    });

    it('falls back to window.AudioEngine and safely handles missing title/content DOM nodes and minimal _debug', () => {
        mockTweakpaneState.withTitleElements = false;
        mockTweakpaneState.withFolderContent = false;

        const minimalEngine = {
            play: vi.fn(),
            mixer: { setState: vi.fn(), removeModifier: vi.fn() },
            spatial: { setSoundPosition: vi.fn() },
            music: { playLoop: vi.fn(), stopLoop: vi.fn(), transitionTo: vi.fn() }
        };
        (globalThis as any).AudioEngine = minimalEngine;

        initAudioDebugPanel();

        expect(mockTweakpaneState.panes).toHaveLength(1);
        const pane = mockTweakpaneState.panes[0];

        // Flush RAF callbacks when title elements are absent and masterOutput is undefined
        flushRafOnce();

        const masterFolder = findFolder(pane, 'MASTER CONTROL');
        masterFolder.bindings.find(b => b.key === 'masterMute')!.emitChange(true);
        masterFolder.bindings.find(b => b.key === 'globalVolume')!.emitChange(0.5);

        // Minimal config creates no BUS MONITORING or MIXER SNAPSHOTS folders
        expect(pane.folders.some((f: IMockFolderRecord) => f.title === 'BUS MONITORING')).toBe(false);
        expect(pane.folders.some((f: IMockFolderRecord) => f.title === 'MIXER SNAPSHOTS')).toBe(false);

        const duckingFolder = findFolder(pane, 'DUCKING MONITOR');
        expect(duckingFolder.blades).toContainEqual({ view: 'text', text: 'No buses available' });

        // Play Sound with 'none' fallback does not invoke audio.play
        findButton(pane, 'Play Sound').click();
        expect(minimalEngine.play).not.toHaveBeenCalled();
    });

    it('handles config without soundMap and respects globalVoiceLimit fallback sources', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Fallback 1: poolManager.globalVoiceLimit & no sidechains found
        const engineFromPool = {
            play: vi.fn(),
            mixer: { setState: vi.fn(), removeModifier: vi.fn() },
            spatial: { setSoundPosition: vi.fn() },
            music: { playLoop: vi.fn(), stopLoop: vi.fn(), transitionTo: vi.fn() },
            _debug: {
                poolManager: { globalVoiceLimit: 48 },
                busSystem: {
                    sidechains: { get: vi.fn().mockReturnValue(undefined) }
                },
                rtpcManager: {},
                config: {
                    buses: { music: {} }
                }
            }
        };
        initAudioDebugPanel(engineFromPool);

        const pane1 = mockTweakpaneState.panes[0];
        const voiceFolder1 = findFolder(pane1, 'VOICE MONITOR');
        expect(voiceFolder1.element.textContent).toContain('0 / 48');
        expect(findFolder(pane1, 'DUCKING MONITOR').blades).toContainEqual({
            view: 'text',
            text: 'No active sidechains found'
        });

        // Fallback 2: router.soundController.debugPool.globalVoiceLimit & empty soundMap/rtpcMap
        const engineFromDebugPool = {
            play: vi.fn(),
            mixer: { setState: vi.fn(), removeModifier: vi.fn() },
            spatial: { setSoundPosition: vi.fn() },
            music: { playLoop: vi.fn(), stopLoop: vi.fn(), transitionTo: vi.fn() },
            _debug: {
                router: {
                    soundController: {
                        debugPool: { globalVoiceLimit: 24 }
                    }
                },
                rtpcManager: {
                    paramToIndex: new Map()
                },
                config: {
                    buses: { music: {} },
                    soundMap: {
                        nonSpatialNonLoop: { busId: 'music' }
                    }
                }
            }
        };
        initAudioDebugPanel(engineFromDebugPool);

        const pane2 = mockTweakpaneState.panes[1];
        const voiceFolder2 = findFolder(pane2, 'VOICE MONITOR');
        expect(voiceFolder2.element.textContent).toContain('0 / 24');
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('wires icons, renderLoop, keydown toggle, master, buses, snapshots, sfx trigger, and ducking monitor', () => {
        const engine = createFullEngine();
        initAudioDebugPanel(engine);

        const pane = mockTweakpaneState.panes[0];

        // Flush first RAF: applies SVG icons and executes renderLoop + pollAndUpdateUI
        flushRafOnce();
        expect(pane.element.querySelector('.tp-rotv_t')?.innerHTML).toContain('AUDIO SYSTEM DEBUG');
        const profileFolder = findFolder(pane, 'PERFORMANCE PROFILER');
        expect(profileFolder.refresh).toHaveBeenCalledTimes(1);

        // Keydown backtick hides pane; subsequent renderLoop flush skips profiler refresh; unrelated key does nothing
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        expect(pane.hidden).toBe(false);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: '`' }));
        expect(pane.hidden).toBe(true);

        flushRafOnce();
        expect(profileFolder.refresh).toHaveBeenCalledTimes(1);

        // Keydown tilde unhides pane again
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '~' }));
        expect(pane.hidden).toBe(false);

        // Master Mute & Volume
        const masterFolder = findFolder(pane, 'MASTER CONTROL');
        const muteBinding = masterFolder.bindings.find(b => b.key === 'masterMute')!;
        muteBinding.emitChange(true);
        expect(engine._debug.masterOutput.mute).toHaveBeenCalledTimes(1);
        muteBinding.emitChange(false);
        expect(engine._debug.masterOutput.unmute).toHaveBeenCalledTimes(1);

        masterFolder.bindings.find(b => b.key === 'globalVolume')!.emitChange(0.45);
        expect(engine._debug.masterOutput.setVolume).toHaveBeenCalledWith(0.45);

        // Bus Monitoring getters & value formatters
        const busFolder = findFolder(pane, 'BUS MONITORING');
        const sfxGraphBinding = busFolder.bindings.find(b => b.key === 'sfx' && b.opts.view === 'graph')!;
        const masterGraphBinding = busFolder.bindings.find(b => b.key === 'master' && b.opts.view === 'graph')!;
        const sfxFormattedBinding = busFolder.bindings.find(
            b => b.key === 'sfx' && typeof b.opts.format === 'function'
        )!;
        expect(sfxGraphBinding.target['sfx']).toBe(0.75);
        expect(masterGraphBinding.target['master']).toBe(0);
        expect(sfxFormattedBinding.opts.format(0.75)).toBe('Vol: 0.75');

        // Mixer Snapshots
        findButton(pane, 'Activate Snapshot').click();
        expect(engine.mixer.setState).toHaveBeenCalledWith('combat_mode');
        findButton(pane, 'Clear Debug Override').click();
        expect(engine.mixer.removeModifier).toHaveBeenCalledWith('debug_override_layer');

        // SFX trigger button
        findButton(pane, 'Play Sound').click();
        expect(engine.play).toHaveBeenCalledWith('gun_shot');

        // Ducking Monitor getter & formatter (including undefined getSidechain fallback)
        const duckFolder = findFolder(pane, 'DUCKING MONITOR');
        const musicDuckBinding = duckFolder.bindings.find(b => b.key === 'music' && b.opts.view === 'graph')!;
        const musicDuckFmt = duckFolder.bindings.find(b => b.key === 'music' && typeof b.opts.format === 'function')!;
        expect(musicDuckBinding.target['music']).toBe(0.42);
        expect(musicDuckFmt.opts.format(0.42)).toBe('Duck: 42%');

        engine._debug.busSystem.getSidechain.mockReturnValueOnce(undefined);
        expect(musicDuckBinding.target['music']).toBe(0);
    });

    it('synchronizes RTPC bindings in both directions without feedback loops during UI refresh', () => {
        const engine = createFullEngine();
        initAudioDebugPanel(engine);

        const pane = mockTweakpaneState.panes[0];
        const rtpcFolder = findFolder(pane, 'RTPC (Real-Time Parameters)');
        const intensityBinding = rtpcFolder.bindings.find(b => b.key === 'intensity')!;

        // 1. User drags slider -> calls rtpcManager.setValue
        intensityBinding.emitChange(0.6);
        expect(engine._debug.rtpcManager.setValue).toHaveBeenCalledWith('intensity', 0.6);

        // 2. Engine changes value externally (> 1e-4) and refresh emits internal change event -> ignored by isSyncingUI
        intensityBinding.triggerChangeOnRefresh = true;
        engine._debug.rtpcManager.setValue('intensity', 0.9);
        vi.mocked(engine._debug.rtpcManager.setValue).mockClear();

        flushRafOnce();
        expect(intensityBinding.target['intensity']).toBe(0.9);
        expect(intensityBinding.refresh).toHaveBeenCalledTimes(1);
        expect(engine._debug.rtpcManager.setValue).not.toHaveBeenCalled();

        // 3. No value change on next frame -> does not call binding.refresh again
        flushRafOnce();
        expect(intensityBinding.refresh).toHaveBeenCalledTimes(1);
    });

    it('handles spatial panner playback results, Map/Array activeVoices, missing spatial API, and error catch', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const engine = createFullEngine();
        initAudioDebugPanel(engine);

        const pane = mockTweakpaneState.panes[0];
        const spatialFolder = findFolder(pane, 'SPATIAL PANNER (2D)');
        const btnPlaySpatial = findButton(pane, 'Play Spatial Sound');
        const posBinding = spatialFolder.bindings.find(b => b.key === 'spatialPos')!;

        // Case A: array of playback IDs + Map activeVoices containing wrapped item, direct item, mismatch, and missing ID
        engine.play.mockReturnValueOnce([11, 12]);
        btnPlaySpatial.click();
        expect(engine.spatial.setSoundPosition).toHaveBeenNthCalledWith(1, { playbackId: 11, x: 0, y: 0, z: 0 });
        expect(engine.spatial.setSoundPosition).toHaveBeenNthCalledWith(2, { playbackId: 12, x: 0, y: 0, z: 0 });

        engine._debug.router.soundController.activeVoices = new Map<number, any>([
            [1, { value: { soundId: 'gun_shot', playbackId: 201 } }],
            [2, { soundId: 'gun_shot', playbackId: 202 }],
            [3, { soundId: 'other_sound', playbackId: 203 }],
            [4, { soundId: 'gun_shot' }],
            [5, null]
        ]);
        posBinding.emitChange({ x: 3, y: -4 });
        expect(engine.spatial.setSoundPosition).toHaveBeenCalledWith({ playbackId: 11, x: 3, y: 0, z: -4 });
        expect(engine.spatial.setSoundPosition).toHaveBeenCalledWith({ playbackId: 12, x: 3, y: 0, z: -4 });
        expect(engine.spatial.setSoundPosition).toHaveBeenCalledWith({ playbackId: 201, x: 3, y: 0, z: -4 });
        expect(engine.spatial.setSoundPosition).toHaveBeenCalledWith({ playbackId: 202, x: 3, y: 0, z: -4 });

        // Case B: single scalar playback ID + Array activeVoices via '#soundController'
        engine.play.mockReturnValueOnce(55);
        btnPlaySpatial.click();
        expect(engine.spatial.setSoundPosition).toHaveBeenCalledWith({ playbackId: 55, x: 3, y: 0, z: -4 });

        delete (engine._debug.router as any).soundController;
        (engine._debug.router as any)['#soundController'] = {
            activeVoices: [{ soundId: 'gun_shot', playbackId: 301 }]
        };
        posBinding.emitChange({ x: 5, y: 6 });
        expect(engine.spatial.setSoundPosition).toHaveBeenCalledWith({ playbackId: 301, x: 5, y: 0, z: 6 });

        // Case C: null playback ID clears active tracked IDs; missing activeVoices skips loop safely
        engine.play.mockReturnValueOnce(null);
        btnPlaySpatial.click();
        (engine._debug.router as any)['#soundController'] = {};
        posBinding.emitChange({ x: 1, y: 2 });

        // Case D: throwing activeVoices getter logs warning in catch block
        engine._debug.router = {
            get soundController() {
                throw new Error('corrupted router state');
            }
        } as any;
        posBinding.emitChange({ x: 2, y: 2 });
        expect(warnSpy).toHaveBeenCalledWith('[Debug] Failed to update global spatial voices', expect.any(Error));

        // Case E: missing engine.spatial skips setSoundPosition calls gracefully
        engine.play.mockReturnValueOnce([77]);
        (engine as any).spatial = undefined;
        btnPlaySpatial.click();
        posBinding.emitChange({ x: 0, y: 0 });
    });

    it('handles smartLoop sequencer transport, quantize grid cells, transition options, and sound changes', () => {
        const engine = createFullEngine();
        initAudioDebugPanel(engine);

        const pane = mockTweakpaneState.panes[0];
        const seqFolder = findFolder(pane, 'SEQUENCER');

        // Initial updateRegions populated loopSoundId & regions from bgm_loop
        const soundBinding = seqFolder.bindings.find(b => b.key === 'loopSoundId')!;
        const regionBinding = seqFolder.bindings.find(b => b.key === 'loopRegion')!;
        expect(soundBinding.target['loopSoundId']).toBe('bgm_loop');
        expect(regionBinding.target['loopRegion']).toBe('A');

        // Transport buttons
        findButton(pane, 'Play Loop').click();
        expect(engine.music.playLoop).toHaveBeenCalledWith('bgm_loop', 'A');

        findButton(pane, 'Stop Loop').click();
        expect(engine.music.stopLoop).toHaveBeenCalledWith('bgm_loop');

        // Quantize Interval radiogrid cell factory
        const intervalBinding = seqFolder.bindings.find(b => b.key === 'quantizeInterval')!;
        expect(intervalBinding.opts.cells(0, 0)).toEqual({ title: '1', value: 1 });
        expect(intervalBinding.opts.cells(3, 1)).toEqual({ title: '8', value: 8 });

        // Transition button
        findButton(pane, 'TRANSITION').click();
        expect(engine.music.transitionTo).toHaveBeenCalledWith({
            soundId: 'bgm_loop',
            targetRegion: 'A',
            transitionRegionName: 'A',
            options: {
                quantize: 'NextBeat',
                quantizeInterval: 1,
                blendMode: 'crossfade',
                crossfadeDuration: 3000,
                interruptable: true
            }
        });

        // Switch to empty_loop (regions.length === 0) keeps existing region selections while updating options to []
        soundBinding.emitChange('empty_loop');
        expect(regionBinding.options).toEqual([]);
        expect(regionBinding.target['loopRegion']).toBe('A');

        // Switch to non-smartLoop sound or missing sound exits updateRegions early without crashing
        soundBinding.emitChange('gun_shot');
        soundBinding.emitChange('missing_track');
    });
});
