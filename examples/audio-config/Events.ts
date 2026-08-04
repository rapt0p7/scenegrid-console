import type { IEventMap, Milliseconds, SoundId } from '@scene-grid/engine';

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
    },
    delayed: {
        actions: [
            {
                type: 'play',
                target: 'punchyKick' as SoundId,
                delay: 5000 as Milliseconds,
                tags: ['sfx']
            }
        ]
    },
    flush: {
        actions: [
            {
                type: 'cancel_pending',
                targetTags: ['sfx']
            }
        ]
    }
} satisfies IEventMap;
