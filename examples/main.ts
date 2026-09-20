// noinspection D

import { AudioEngine, WorkletLoader } from '@scene-grid/engine';

import {
    Buses,
    Snapshots,
    SoundMap,
    RTPCManifest,
    Events,
    BankManifest,
    MusicFSM,
    AudioSizes,
    SoundManifest
} from './audio-config/index.js';

type MySounds = keyof typeof SoundMap;
type MyEvents = keyof typeof Events;
type MyBanks = keyof typeof BankManifest;
type MySnapshots = keyof typeof Snapshots;
type MyGameParams = keyof typeof RTPCManifest;

declare module '@scene-grid/engine' {
    export interface SceneGridRegistry {
        SoundIds: MySounds;
        EventIds: MyEvents;
        BankIds: MyBanks;
        SnapshotIds: MySnapshots;
        GameParamIds: MyGameParams;
    }
}

// oxlint-disable-next-line max-lines-per-function
async function bootstrap() {
    const audio = new AudioEngine({
        manifest: SoundManifest,
        buses: Buses,
        snapshots: Snapshots,
        soundMap: SoundMap,
        rtpcManifest: RTPCManifest,
        events: Events,
        banks: BankManifest,
        musicFSM: MusicFSM,
        precalculatedSizes: AudioSizes,
        ramQuotaMb: Number.MAX_SAFE_INTEGER,
        globalVoiceLimit: 32,
        remoteSyncUri: 'ws://localhost:8081'
    });

    const spinner = document.querySelector('#spinner');
    const startMessage = document.querySelector('.start-trigger');

    audio.events.on('load:progress', ({ progress, lastLoadedResource }) => {
        const percent = Math.round(progress * 100);
        console.log(`[Demo UI] Loading: ${percent}% (${lastLoadedResource})`);
    });

    audio.events.on('load:complete', ({ failedItems, durationMs }) => {
        console.log(`[Demo UI] Load complete in ${durationMs.toFixed(0)}ms`);
        if (failedItems.length > 0) {
            console.warn(`[Demo UI] Missing assets:`, failedItems);
        }

        spinner?.remove();
        if (startMessage) {
            (startMessage as HTMLElement).style.display = 'block';
        }
    });

    audio.events.on('engine:error', error => {
        console.error(`[Demo UI] Engine Error (${error.code}):`, error.message);
    });

    try {
        await audio.init({ isStrictValidation: false });
    } catch {
        console.error('[Demo UI] Bootstrap aborted due to init failure.');
        return;
    }

    await audio.banks.load('music');
    await audio.banks.load('sfx');
    await audio.banks.load('sfx2');
    await audio.streams.load('backgroundMain');

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    globalThis.AudioEngine = audio;

    console.log('[Demo UI] Engine ready! Waiting for user interaction...');

    globalThis.addEventListener(
        'pointerup',
        // oxlint-disable-next-line typescript/strict-void-return, typescript/no-misused-promises
        async () => {
            await audio.unlock();

            audio.mixer.setState('idle');

            audio.play('backgroundMain', { isLoop: true });
            audio.play('backgroundMain2', { isLoop: true });
            audio.play('backgroundMain3', { isLoop: true });
            // audio.music.playLoop('smartLoop', 'A');
            // audio.conductor.start();

            if (process.env.NODE_ENV !== 'production') {
                void import('@scene-grid/inspector').then(({ attachDebugUI, initAudioDebugPanel }) => {
                    void attachDebugUI(audio, { wrapperSelector: '#wrapper', workletLoader: WorkletLoader });
                    initAudioDebugPanel(audio);
                });
            }
        },
        { once: true }
    );

    audio.events.on('state:suspended', () => {
        console.log('[Demo UI] Tab hidden or audio interrupted. Pausing game...');
    });

    audio.events.on('state:resumed', () => {
        console.log('[Demo UI] Audio resumed.');
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            audio.suspend().catch(console.error);
        } else {
            audio.unlock().catch(console.error);
        }
    });

    if (import.meta.hot) {
        // oxlint-disable-next-line typescript/strict-void-return, typescript/no-misused-promises
        import.meta.hot.accept('./audio-config/index.js', async newModule => {
            if (newModule) {
                console.log('[HMR] Caught audio config updates!', newModule);

                const updatedConfig = {
                    ...audio.config,
                    buses: newModule.Buses,
                    snapshots: newModule.Snapshots,
                    soundMap: newModule.SoundMap,
                    rtpcManifest: newModule.RTPCManifest
                };

                // oxlint-disable-next-line no-underscore-dangle
                await audio._hotReloadConfig(updatedConfig);
            }
        });
    }
}

try {
    await bootstrap();
} catch (error) {
    console.error(error);
}
