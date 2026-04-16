// noinspection D

import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { AudioProfiler } from './Infrastructure/debug/AudioProfiler.js';

const audio = window.AudioEngine;
if (!audio) {
    console.warn('[Debug] AudioEngine is not available on window.');
}

const { busSystem, masterOutput, rtpcManager, router, config } = audio?._debug || {};

const BUS_IDS = config?.buses ? Object.keys(config.buses) : [];
const SNAPSHOT_IDS = config?.snapshots ? Object.keys(config.snapshots) : [];

const TEST_SOUND_EVENTS = [
    'kickDrum',
    'punchyKick',
    'epicSynth',
    'explosion',
    'explosion2',
    'heavyKick',
    'kbKickMetallic',
    'hardstyleKick',
    'collectPoints',
    'kickDrum2',
    'collectRing',
    'collectRing2',
    'tick'
];

const toOptions = arr => arr.map(id => ({ text: id.replace('_', ' ').toUpperCase(), value: id }));

const PARAMS = {
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
    buses: {},
    busesMonitor: {},
    duckingMonitor: {},
    limiterMonitor: {},
    rtpc: {},
    spatialSoundId: '',
    spatialPos: { x: 0, y: 0 }
};

const applyIcon = (component, iconId, text) => {
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

export function initAudioDebugPanel() {
    if (!audio) return;

    const pane = new Pane({ title: 'AUDIO SYSTEM DEBUG', expanded: true });
    pane.registerPlugin(EssentialsPlugin);
    applyIcon(pane, 'fad-speaker', 'AUDIO SYSTEM DEBUG');

    // --- 0. PERFORMANCE & MATH PROFILER ---
    const profiler = new AudioProfiler(audio);
    const fProfile = pane.addFolder({ title: 'PERFORMANCE PROFILER', expanded: true });
    applyIcon(fProfile, 'fad-tachometer-alt', 'PERFORMANCE PROFILER');

    // Voice Metrics
    fProfile.addBinding(profiler.metrics.voices, 'totalTracked', { readonly: true, label: 'Total Voices' });
    fProfile.addBinding(profiler.metrics.voices, 'hardwareActive', { readonly: true, label: 'Hardware (Playing)' });
    fProfile.addBinding(profiler.metrics.voices, 'virtualCulled', { readonly: true, label: 'Virtual (Culled)' });
    fProfile.addBlade({ view: 'separator' });

    // Mixer Layers Stack
    fProfile.addBinding(profiler.metrics.mixer, 'globalSnapshot', { readonly: true, label: 'Global Snapshot' });
    fProfile.addBinding(profiler.metrics.mixer, 'activeLayers', { readonly: true, label: 'Active Overlays' });
    fProfile.addBlade({ view: 'separator' });

    // Transparent Bus Math
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

    fMaster.addBinding(PARAMS, 'masterMute', { label: 'Mute All' }).on('change', ev => {
        ev.value ? masterOutput?.mute() : masterOutput?.unmute();
    });
    fMaster
        .addBinding(PARAMS, 'globalVolume', { label: 'Global Vol', min: 0, max: 1, step: 0.01 })
        .on('change', ev => masterOutput?.setVolume(ev.value));

    // --- 2. BUS MONITORING ---
    if (BUS_IDS.length > 0) {
        const fMonitor = pane.addFolder({ title: 'BUS MONITORING', expanded: false });
        applyIcon(fMonitor, 'fad-waveform', 'BUS MONITORING');

        BUS_IDS.forEach(busId => {
            Object.defineProperty(PARAMS.busesMonitor, busId, {
                get: () => busSystem?.getCurrentRealGain(busId) || 0
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
                format: v => `Vol: ${v.toFixed(2)}`
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
        btnClear.on('click', () => audio.mixer.pop('debug_override_layer'));
    }

    // --- 4. SOUND TRIGGER TEST (Router) ---
    const fTest = pane.addFolder({ title: 'SOUND TRIGGER TEST', expanded: false });
    applyIcon(fTest, 'fad-drumpad', 'SOUND TRIGGER TEST');

    fTest.addBinding(PARAMS, 'testSound', { label: 'Event', options: toOptions(TEST_SOUND_EVENTS) });

    const btnPlay = fTest.addButton({ title: 'Play Sound' });
    applyIcon(btnPlay, 'fad-play', 'Play Sound');
    btnPlay.on('click', () => audio.play(PARAMS.testSound));

    // --- 5. SMART LOOP MANAGER ---
    setupSmartLoopSection(pane);

    setupDuckingMonitor(pane);
    setupRTPCSection(pane);

    setupSpatialSection(pane);

    document.addEventListener('keydown', e => {
        if (e.key === '`' || e.key === '~') pane.hidden = !pane.hidden;
    });
}

function setupDuckingMonitor(pane) {
    const fDucking = pane.addFolder({ title: 'DUCKING MONITOR', expanded: false });
    applyIcon(fDucking, 'fad-automation-3p', 'DUCKING MONITOR');

    if (!BUS_IDS.length) {
        fDucking.addBlade({ view: 'text', text: 'No buses available' });
        return;
    }

    let hasSidechains = false;

    BUS_IDS.forEach(busId => {
        if (!busSystem?.sidechains?.get(busId)) return;
        hasSidechains = true;

        Object.defineProperty(PARAMS.duckingMonitor, busId, {
            get: () => busSystem.getSidechain(busId)?.activeEnvelope || 0
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
            format: v => `Duck: ${(v * 100).toFixed(0)}%`
        });
        fDucking.addBlade({ view: 'separator' });
    });

    if (!hasSidechains) fDucking.addBlade({ view: 'text', text: 'No active sidechains found' });
}

function setupRTPCSection(pane) {
    if (!rtpcManager) return;

    const paramMap = rtpcManager['paramToIndex'];
    const rtpcsKeys = paramMap ? Array.from(paramMap.keys()) : [];

    if (rtpcsKeys.length === 0) return;

    const fRTPC = pane.addFolder({ title: 'RTPC (Real-Time Parameters)', expanded: false });
    applyIcon(fRTPC, 'fad-slider-round-2', 'RTPC (Real-Time Parameters)');

    rtpcsKeys.forEach(key => {
        PARAMS.rtpc[key] = rtpcManager.getValue(key);

        const binding = fRTPC.addBinding(PARAMS.rtpc, key, { label: key, step: 0.01 });

        binding.on('change', ev => {
            rtpcManager.setValue(key, ev.value);
        });

        rtpcManager.on(key, newValue => {
            if (PARAMS.rtpc[key] !== newValue) {
                PARAMS.rtpc[key] = newValue;
                binding.refresh();
            }
        });
    });
}

function setupSpatialSection(pane) {
    if (!config || !config.soundMap) return;

    const SPATIAL_SOUNDS = Object.keys(config.soundMap).filter(id => {
        const cfg = config.soundMap[id];
        return cfg.spatial || cfg.hasPanner;
    });

    const fSpatial = pane.addFolder({ title: 'SPATIAL PANNER (2D)', expanded: false });
    applyIcon(fSpatial, 'fad-arrows-horz', 'SPATIAL PANNER (2D)');

    if (!SPATIAL_SOUNDS.length) {
        return;
    }

    PARAMS.spatialSoundId = SPATIAL_SOUNDS[0];
    PARAMS.spatialPos = { x: 0, y: 0 };

    fSpatial.addBinding(PARAMS, 'spatialSoundId', {
        label: 'Sound',
        options: toOptions(SPATIAL_SOUNDS)
    });

    let lastDebuggerPlaybackIds = [];

    const btnPlay = fSpatial.addButton({ title: 'Play Spatial Sound' });
    applyIcon(btnPlay, 'fad-play', 'Play Spatial Sound');

    btnPlay.on('click', () => {
        const ids = audio.play(PARAMS.spatialSoundId);
        lastDebuggerPlaybackIds = Array.isArray(ids) ? ids : [ids];

        lastDebuggerPlaybackIds.forEach(id => {
            if (id) audio.spatial.setSoundPosition(id, PARAMS.spatialPos.x, 0, PARAMS.spatialPos.y);
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
        .on('change', ev => {
            const { x, y } = ev.value;
            const targetSoundId = PARAMS.spatialSoundId;

            lastDebuggerPlaybackIds.forEach(id => {
                if (id) audio.spatial.setSoundPosition(id, x, 0, y);
            });

            try {
                const activeVoices = audio._debug?.router?.soundController?.activeVoices;
                if (activeVoices) {
                    const voicesIter = activeVoices instanceof Map ? Array.from(activeVoices.values()) : activeVoices;

                    voicesIter.forEach(item => {
                        const voice = item?.value || item;

                        if (voice && voice.soundId === targetSoundId && voice.playbackId) {
                            audio.spatial.setSoundPosition(voice.playbackId, x, 0, y);
                        }
                    });
                }
            } catch (e) {
                console.warn('[Debug] Failed to update global spatial voices', e);
            }
        });
}

function setupSmartLoopSection(pane) {
    const fLoop = pane.addFolder({ title: 'SMART LOOP MANAGER', expanded: false });
    applyIcon(fLoop, 'fad-loop', 'SMART LOOP MANAGER');

    if (!config || !config.soundMap) return;

    const SOUND_IDS = Object.keys(config.soundMap).filter(id => config.soundMap[id].smartLoop);

    if (!SOUND_IDS.length) {
        return;
    }

    PARAMS.loopSoundId = SOUND_IDS[0];
    const soundInput = fLoop.addBinding(PARAMS, 'loopSoundId', { label: 'Sound', options: toOptions(SOUND_IDS) });
    const regionInput = fLoop.addBinding(PARAMS, 'loopRegion', { label: 'Region', options: {} });

    const btnGroup = fLoop.addFolder({ title: 'Transport', expanded: true });

    const btnPlayLoop = btnGroup.addButton({ title: 'Play Loop' });
    applyIcon(btnPlayLoop, 'fad-play', 'Play Loop');
    btnPlayLoop.on('click', () => audio.music.playLoop(PARAMS.loopSoundId, PARAMS.loopRegion));

    const btnStopLoop = btnGroup.addButton({ title: 'Stop Loop' });
    applyIcon(btnStopLoop, 'fad-stop', 'Stop Loop');
    btnStopLoop.on('click', () => audio.music.stopLoop(PARAMS.loopSoundId));

    fLoop.addBlade({ view: 'separator' });

    const targetRegionInput = fLoop.addBinding(PARAMS, 'targetRegion', { label: 'Target', options: {} });
    const transRegionInput = fLoop.addBinding(PARAMS, 'transitionRegion', { label: 'Transition', options: {} });

    fLoop.addBinding(PARAMS, 'quantize', {
        label: 'Quantize',
        options: { 'Immediate': 'Immediate', 'Next Beat': 'NextBeat', 'Next Bar': 'NextBar' }
    });
    fLoop.addBinding(PARAMS, 'quantizeInterval', {
        view: 'radiogrid',
        groupName: 'quant_interval',
        size: [4, 2],
        cells: (x, y) => {
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

    const updateRegions = soundId => {
        const cfg = config.soundMap[soundId];
        if (!cfg || !cfg.smartLoop) return;

        const regions = Object.keys(cfg.smartLoop.regions);
        const regionOpts = toOptions(regions);

        regionInput.options = regionOpts;
        targetRegionInput.options = regionOpts;
        transRegionInput.options = regionOpts;
        PARAMS.loopRegion = regions[0];
        PARAMS.targetRegion = regions[0];
        PARAMS.transitionRegion = regions[0];
        pane.refresh();
    };

    updateRegions(PARAMS.loopSoundId);
    soundInput.on('change', ev => updateRegions(ev.value));
}

requestAnimationFrame(() => initAudioDebugPanel());
