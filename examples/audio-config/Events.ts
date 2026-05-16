import type { IEventMap, SoundId } from 'src/index.js';

export default {
    stop: {
        actions: [
            {
                type: 'stop',
                target: 'backgroundMain' as SoundId,
                options: {
                    allowTail: true
                }
            },
            {
                type: 'play',
                target: 'punchyKick' as SoundId
            }
        ]
    }
} satisfies IEventMap;
