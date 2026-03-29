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

    await audio.init();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    globalThis.AudioEngine = audio;

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
}

try {
    await bootstrap();
} catch (error) {
    console.error(error);
}
