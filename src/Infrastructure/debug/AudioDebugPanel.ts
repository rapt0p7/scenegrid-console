/* eslint-disable @typescript-eslint/naming-convention */
// oxlint-disable max-lines-per-function, typescript/prefer-readonly-parameter-types
// noinspection D

import { Pane, FolderApi } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { AudioProfiler } from './AudioProfiler.js';
import { VoiceMeterWidget } from '@infrastructure/debug/ui/VoiceMeterWidget.js';
import { VoiceListWidget } from '@infrastructure/debug/ui/VoiceListWidget.js';

interface IDebuggableEngine {
    play(soundId: string): any;
    mixer: {
        setState(state: string): void;
        removeModifier(id: string): void;
    };
    spatial: {
        setSoundPosition(params: { playbackId: any; x: number; y: number; z: number }): void;
    };
    music: {
        playLoop(soundId: string, region: string): void;
        stopLoop(soundId: string): void;
        transitionTo(params: any): void;
    };
    _debug?: {
        busSystem: any;
        masterOutput: any;
        rtpcManager: any;
        router: any;
        config: any;
    };
}

interface IDebugParams {
    masterMute: boolean;
    globalVolume: number;
    activeSnapshot: string;
    testSound: string;
    loopSoundId: string;
    loopRegion: string;
    targetRegion: string;
    transitionRegion: string;
    quantize: 'Immediate' | 'NextBeat' | 'NextBar';
    quantizeInterval: number;
    blendMode: 'overlap' | 'crossfade';
    crossfade: number;
    interruptable: boolean;
    busesMonitor: Record<string, number>;
    duckingMonitor: Record<string, number>;
    rtpc: Record<string, number>;
    spatialSoundId: string;
    spatialPos: { x: number; y: number };
}

const toOptions = (arr: string[]) => arr.map(id => ({ text: id.replaceAll('_', ' ').toUpperCase(), value: id }));

const applyIcon = (component: any, iconId: string, text: string) => {
    requestAnimationFrame(() => {
        const titleEl = component.element.querySelector('.tp-rotv_t, .tp-fldv_t, .tp-btnv_t');
        if (titleEl) {
            titleEl.innerHTML = `
                <svg style="width: 14px; height: 14px; margin-right: 6px; vertical-align: text-bottom; fill: currentColor;">
                    <use href="#${iconId}"></use>
                </svg>${text}`;
        }
    });
    return component;
};

export function initAudioDebugPanel(engineInstance?: IDebuggableEngine): void {
    const audio: IDebuggableEngine = engineInstance ?? (window as any).AudioEngine;

    if (!audio) {
        console.warn('[Debug] AudioEngine is not available.');
        return;
    }

    const { busSystem, masterOutput, rtpcManager, config } = audio._debug ?? {};

    const BUS_IDS = config?.buses ? Object.keys(config.buses) : [];
    const SNAPSHOT_IDS = config?.snapshots ? Object.keys(config.snapshots) : [];
    const SOUND_KEYS = config?.soundMap ? Object.keys(config.soundMap) : [];
    const SFX_SOUNDS = SOUND_KEYS.filter(id => config.soundMap[id].busId.toLowerCase().includes('sfx'));
    const TEST_SOUND_EVENTS = SFX_SOUNDS.length > 0 ? SFX_SOUNDS : ['none'];

    const PARAMS: IDebugParams = {
        masterMute: false,
        globalVolume: 1.0,
        activeSnapshot: SNAPSHOT_IDS[0] || '',
        testSound: TEST_SOUND_EVENTS[0],
        loopSoundId: '',
        loopRegion: '',
        targetRegion: '',
        transitionRegion: '',
        quantize: 'NextBeat',
        quantizeInterval: 1,
        blendMode: 'crossfade',
        crossfade: 3.0,
        interruptable: true,
        busesMonitor: {},
        duckingMonitor: {},
        rtpc: {},
        spatialSoundId: '',
        spatialPos: { x: 0, y: 0 }
    };

    const pane = new Pane({ title: 'AUDIO SYSTEM DEBUG', expanded: true });
    pane.registerPlugin(EssentialsPlugin);
    applyIcon(pane, 'fad-speaker', 'AUDIO SYSTEM DEBUG');

    // --- 0. PERFORMANCE & MATH PROFILER ---
    const profiler = new AudioProfiler(audio as any);
    const fProfile = pane.addFolder({ title: 'PERFORMANCE PROFILER', expanded: true });
    applyIcon(fProfile, 'fad-tachometer-alt', 'PERFORMANCE PROFILER');

    const fVoice = fProfile.addFolder({ title: 'VOICE MONITOR', expanded: true });

    const voiceContainer = fVoice.element.querySelector('.tp-fldv_c') ?? fVoice.element;
    const globalVoiceLimit = audio._debug?.config?.globalVoiceLimit ?? 32;

    const voiceMeter = new VoiceMeterWidget(voiceContainer as HTMLElement, globalVoiceLimit);
    const voiceList = new VoiceListWidget(voiceContainer as HTMLElement);

    const originalTick = profiler.tick.bind(profiler);
    profiler.tick = () => {
        originalTick();
        voiceMeter.update(profiler.metrics.voices.hardwareActive, profiler.metrics.voices.virtualCulled);
        voiceList.update(profiler.metrics.voices.dump);
    };

    fProfile.addBinding(profiler.metrics.mixer, 'globalSnapshot', { readonly: true, label: 'Global Snapshot' });
    fProfile.addBinding(profiler.metrics.mixer, 'activeLayers', { readonly: true, label: 'Active Overlays' });
    fProfile.addBlade({ view: 'separator' });

    const fBusMath = fProfile.addFolder({ title: 'BUS MATH (Logical × RTPC = Final)', expanded: false });
    Object.keys(profiler.metrics.buses).forEach(busId => {
        fBusMath.addBinding(profiler.metrics.buses, busId, { readonly: true, label: busId.toUpperCase() });
    });

    const renderLoop = () => {
        if (!pane.hidden) {
            profiler.tick();
            fProfile.refresh();
        }
        requestAnimationFrame(renderLoop);
    };
    requestAnimationFrame(renderLoop);

    // --- 1. MASTER CONTROL ---
    const fMaster = pane.addFolder({ title: 'MASTER CONTROL' });
    applyIcon(fMaster, 'fad-stereo', 'MASTER CONTROL');

    fMaster.addBinding(PARAMS, 'masterMute', { label: 'Mute All' }).on('change', event => {
        if (masterOutput) {
            if (event.value) {
                masterOutput.mute();
            } else {
                masterOutput.unmute();
            }
        }
    });
    fMaster
        .addBinding(PARAMS, 'globalVolume', { label: 'Global Vol', min: 0, max: 1, step: 0.01 })
        .on('change', event => {
            if (masterOutput) masterOutput.setVolume(event.value);
        });

    // --- 2. BUS MONITORING ---
    if (BUS_IDS.length > 0) {
        const fMonitor = pane.addFolder({ title: 'BUS MONITORING', expanded: false });
        applyIcon(fMonitor, 'fad-waveform', 'BUS MONITORING');

        BUS_IDS.forEach(busId => {
            Object.defineProperty(PARAMS.busesMonitor, busId, {
                get: () => busSystem?.getCurrentRealGain(busId) ?? 0
            });

            fMonitor.addBinding(PARAMS.busesMonitor, busId, {
                readonly: true,
                view: 'graph',
                min: 0,
                max: 1,
                label: busId.toUpperCase()
            });
            fMonitor.addBinding(PARAMS.busesMonitor, busId, {
                readonly: true,
                label: ' ',
                format: (v: unknown) => `Vol: ${Number(v).toFixed(2)}`
            });
            fMonitor.addBlade({ view: 'separator' });
        });
    }

    // --- 3. MIXER SNAPSHOTS ---
    if (SNAPSHOT_IDS.length > 0) {
        const fSnap = pane.addFolder({ title: 'MIXER SNAPSHOTS', expanded: false });
        applyIcon(fSnap, 'fad-preset-a', 'MIXER SNAPSHOTS');

        fSnap.addBinding(PARAMS, 'activeSnapshot', { label: 'State', options: toOptions(SNAPSHOT_IDS) });

        const btnSnap = fSnap.addButton({ title: 'Activate Snapshot' });
        applyIcon(btnSnap, 'fad-next', 'Activate Snapshot');
        btnSnap.on('click', () => {
            audio.mixer.setState(PARAMS.activeSnapshot);
        });

        const btnClear = fSnap.addButton({ title: 'Clear Debug Override' });
        btnClear.on('click', () => {
            audio.mixer.removeModifier('debug_override_layer');
        });
    }

    // --- 4. SOUND TRIGGER TEST (SFX) ---
    const fTest = pane.addFolder({ title: 'SOUND TRIGGER TEST (SFX)', expanded: false });
    applyIcon(fTest, 'fad-drumpad', 'SOUND TRIGGER TEST');

    fTest.addBinding(PARAMS, 'testSound', { label: 'Event', options: toOptions(TEST_SOUND_EVENTS) });

    const btnPlay = fTest.addButton({ title: 'Play Sound' });
    applyIcon(btnPlay, 'fad-play', 'Play Sound');
    btnPlay.on('click', () => {
        if (PARAMS.testSound !== 'none') audio.play(PARAMS.testSound);
    });

    setupSmartLoopSection(pane, audio, PARAMS, config);
    setupDuckingMonitor(pane, PARAMS, busSystem, BUS_IDS);
    setupRTPCSection(pane, PARAMS, rtpcManager);
    setupSpatialSection(pane, audio, PARAMS, config);

    document.addEventListener('keydown', e => {
        if (e.key === '`' || e.key === '~') pane.hidden = !pane.hidden;
    });
}

function setupDuckingMonitor(pane: Pane, PARAMS: IDebugParams, busSystem: any, BUS_IDS: string[]) {
    const fDucking = pane.addFolder({ title: 'DUCKING MONITOR', expanded: false });
    applyIcon(fDucking, 'fad-automation-3p', 'DUCKING MONITOR');

    if (BUS_IDS.length === 0) {
        fDucking.addBlade({ view: 'text', text: 'No buses available' });
        return;
    }

    let hasSidechains = false;

    BUS_IDS.forEach(busId => {
        if (!busSystem?.sidechains?.get(busId)) return;
        hasSidechains = true;

        Object.defineProperty(PARAMS.duckingMonitor, busId, {
            get: () => busSystem.getSidechain(busId)?.activeEnvelope ?? 0
        });

        fDucking.addBinding(PARAMS.duckingMonitor, busId, {
            readonly: true,
            view: 'graph',
            min: 0,
            max: 1,
            label: busId.toUpperCase()
        });
        fDucking.addBinding(PARAMS.duckingMonitor, busId, {
            readonly: true,
            label: ' ',
            format: (v: unknown) => `Duck: ${(Number(v) * 100).toFixed(0)}%`
        });
        fDucking.addBlade({ view: 'separator' });
    });

    if (!hasSidechains) fDucking.addBlade({ view: 'text', text: 'No active sidechains found' });
}

function setupRTPCSection(pane: Pane, PARAMS: IDebugParams, rtpcManager: any) {
    if (!rtpcManager) return;

    const paramMap = rtpcManager['paramToIndex'];
    const rtpcsKeys = paramMap ? Array.from(paramMap.keys()) : [];

    if (rtpcsKeys.length === 0) return;

    const fRTPC = pane.addFolder({ title: 'RTPC (Real-Time Parameters)', expanded: false });
    applyIcon(fRTPC, 'fad-slider-round-2', 'RTPC (Real-Time Parameters)');

    const activeBindings: { key: string; binding: ReturnType<FolderApi['addBinding']> }[] = [];
    let isSyncingUI = false;

    for (let i = 0; i < rtpcsKeys.length; i++) {
        const key = rtpcsKeys[i] as string;
        PARAMS.rtpc[key] = rtpcManager.getValue(key);

        const binding = fRTPC.addBinding(PARAMS.rtpc, key, { label: key, step: 0.01 });

        binding.on('change', event => {
            if (isSyncingUI) return;
            rtpcManager.setValue(key, event.value);
        });

        activeBindings.push({ key, binding });
    }

    const pollAndUpdateUI = () => {
        isSyncingUI = true;

        for (let i = 0; i < activeBindings.length; i++) {
            const { key, binding } = activeBindings[i];
            const engineValue = rtpcManager.getValue(key);

            if (Math.abs(PARAMS.rtpc[key] - engineValue) > 1e-4) {
                PARAMS.rtpc[key] = engineValue;
                binding.refresh();
            }
        }

        isSyncingUI = false;
        requestAnimationFrame(pollAndUpdateUI);
    };

    requestAnimationFrame(pollAndUpdateUI);
}

function setupSpatialSection(pane: Pane, audio: IDebuggableEngine, PARAMS: IDebugParams, config: any) {
    if (!config || !config.soundMap) return;

    const SPATIAL_SOUNDS = Object.keys(config.soundMap).filter(id => {
        const cfg = config.soundMap[id];
        return cfg.spatial ?? cfg.hasPanner;
    });

    const fSpatial = pane.addFolder({ title: 'SPATIAL PANNER (2D)', expanded: false });
    applyIcon(fSpatial, 'fad-arrows-horz', 'SPATIAL PANNER (2D)');

    if (SPATIAL_SOUNDS.length === 0) {
        return;
    }

    PARAMS.spatialSoundId = SPATIAL_SOUNDS[0];
    PARAMS.spatialPos = { x: 0, y: 0 };

    fSpatial.addBinding(PARAMS, 'spatialSoundId', {
        label: 'Sound',
        options: toOptions(SPATIAL_SOUNDS)
    });

    let lastDebuggerPlaybackIds: number[] = [];

    const btnPlay = fSpatial.addButton({ title: 'Play Spatial Sound' });
    applyIcon(btnPlay, 'fad-play', 'Play Spatial Sound');

    btnPlay.on('click', () => {
        const ids = audio.play(PARAMS.spatialSoundId);
        lastDebuggerPlaybackIds = Array.isArray(ids) ? ids : ids ? [ids] : [];

        lastDebuggerPlaybackIds.forEach(id => {
            if (id && audio.spatial) {
                audio.spatial.setSoundPosition({
                    playbackId: id,
                    x: PARAMS.spatialPos.x,
                    y: 0,
                    z: PARAMS.spatialPos.y
                });
            }
        });
    });

    fSpatial
        .addBinding(PARAMS, 'spatialPos', {
            label: 'Position (X/Z)',
            picker: 'inline',
            expanded: true,
            x: { min: -15, max: 15 },
            y: { min: -15, max: 15, inverted: true }
        })
        .on('change', event => {
            const { x, y } = event.value as { x: number; y: number };
            const targetSoundId = PARAMS.spatialSoundId;

            lastDebuggerPlaybackIds.forEach(id => {
                if (id && audio.spatial) {
                    audio.spatial.setSoundPosition({ playbackId: id, x, y: 0, z: y });
                }
            });

            try {
                const activeVoices =
                    audio._debug?.router?.['#soundController']?.activeVoices ??
                    audio._debug?.router?.soundController?.activeVoices;

                if (activeVoices) {
                    const voicesIter = activeVoices instanceof Map ? Array.from(activeVoices.values()) : activeVoices;

                    voicesIter.forEach((item: any) => {
                        const voice = item?.value ?? item;

                        if (voice && voice.soundId === targetSoundId && voice.playbackId && audio.spatial) {
                            audio.spatial.setSoundPosition({ playbackId: voice.playbackId, x, y: 0, z: y });
                        }
                    });
                }
            } catch (e) {
                console.warn('[Debug] Failed to update global spatial voices', e);
            }
        });
}

function setupSmartLoopSection(pane: Pane, audio: IDebuggableEngine, PARAMS: IDebugParams, config: any) {
    const fLoop = pane.addFolder({ title: 'SEQUENCER', expanded: false });
    applyIcon(fLoop, 'fad-loop', 'SEQUENCER');

    if (!config || !config.soundMap) return;

    const SOUND_IDS = Object.keys(config.soundMap).filter(id => config.soundMap[id].smartLoop);

    if (SOUND_IDS.length === 0) {
        return;
    }

    PARAMS.loopSoundId = SOUND_IDS[0];
    const soundInput = fLoop.addBinding(PARAMS, 'loopSoundId', { label: 'Sound', options: toOptions(SOUND_IDS) });
    const regionInput = fLoop.addBinding(PARAMS, 'loopRegion', { label: 'Region', options: [] });

    const btnGroup = fLoop.addFolder({ title: 'Transport', expanded: true });

    const btnPlayLoop = btnGroup.addButton({ title: 'Play Loop' });
    applyIcon(btnPlayLoop, 'fad-play', 'Play Loop');
    btnPlayLoop.on('click', () => {
        audio.music.playLoop(PARAMS.loopSoundId, PARAMS.loopRegion);
    });

    const btnStopLoop = btnGroup.addButton({ title: 'Stop Loop' });
    applyIcon(btnStopLoop, 'fad-stop', 'Stop Loop');
    btnStopLoop.on('click', () => {
        audio.music.stopLoop(PARAMS.loopSoundId);
    });

    fLoop.addBlade({ view: 'separator' });

    const targetRegionInput = fLoop.addBinding(PARAMS, 'targetRegion', { label: 'Target', options: [] });
    const transRegionInput = fLoop.addBinding(PARAMS, 'transitionRegion', { label: 'Transition', options: [] });

    fLoop.addBinding(PARAMS, 'quantize', {
        label: 'Quantize',
        options: { 'Immediate': 'Immediate', 'Next Beat': 'NextBeat', 'Next Bar': 'NextBar' }
    });
    fLoop.addBinding(PARAMS, 'quantizeInterval', {
        view: 'radiogrid',
        groupName: 'quant_interval',
        size: [4, 2],
        cells: (x: number, y: number) => {
            const v = [
                [1, 2, 3, 4],
                [5, 6, 7, 8]
            ];
            return { title: String(v[y][x]), value: v[y][x] };
        },
        label: 'Interval'
    });
    fLoop.addBinding(PARAMS, 'blendMode', { label: 'Blend', options: { Overlap: 'overlap', Crossfade: 'crossfade' } });
    fLoop.addBinding(PARAMS, 'crossfade', { label: 'Fade (s)', min: 0, max: 10, step: 0.001 });
    fLoop.addBinding(PARAMS, 'interruptable', { label: 'Interruptable' });

    const btnTrans = fLoop.addButton({ title: 'TRANSITION' });
    applyIcon(btnTrans, 'fad-forward', 'TRANSITION');
    btnTrans.on('click', () => {
        audio.music.transitionTo({
            soundId: PARAMS.loopSoundId,
            targetRegion: PARAMS.targetRegion,
            transitionRegionName: PARAMS.transitionRegion,
            options: {
                quantize: PARAMS.quantize,
                quantizeInterval: PARAMS.quantizeInterval,
                blendMode: PARAMS.blendMode,
                crossfadeDuration: PARAMS.crossfade * 1000,
                interruptable: PARAMS.interruptable
            }
        });
    });

    const updateRegions = (soundId: string) => {
        const cfg = config.soundMap[soundId];
        if (!cfg || !cfg.smartLoop) return;

        const regions = Object.keys(cfg.smartLoop.regions);
        const regionOpts = toOptions(regions);

        (regionInput as any).options = regionOpts;
        (targetRegionInput as any).options = regionOpts;
        (transRegionInput as any).options = regionOpts;

        if (regions.length > 0) {
            PARAMS.loopRegion = regions[0];
            PARAMS.targetRegion = regions[0];
            PARAMS.transitionRegion = regions[0];
        }
        pane.refresh();
    };

    updateRegions(PARAMS.loopSoundId);
    soundInput.on('change', event => {
        updateRegions(event.value);
    });
}
