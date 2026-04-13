import { AudioEngine } from '../src/index.js';

import Buses from './audio-config/Buses.js';
import Snapshots from './audio-config/Snapshots.js';
import SoundMap from './audio-config/SoundMap.js';
import soundManifest from './soundManifest.js';

async function bootstrap() {
    const audio = new AudioEngine({
        manifest: soundManifest,
        buses: Buses,
        snapshots: Snapshots,
        soundMap: SoundMap,
        globalVoiceLimit: 32
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

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    globalThis.AudioEngine = audio;

    console.log('[Demo UI] Engine ready! Waiting for user interaction...');

    globalThis.addEventListener(
        'pointerup',
        async () => {
            await audio.unlock();

            void audio.showDebugUI({ wrapperSelector: '#wrapper' });

            await audio.mixer.setState('idle');

            audio.play('backgroundMain', { isLoop: true });
            audio.play('backgroundMain2', { isLoop: true });
            audio.play('backgroundMain3', { isLoop: true });

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            await import('../src/debug.js');
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
}

try {
    await bootstrap();
} catch (error) {
    console.error(error);
}
