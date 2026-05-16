import type { EventAction, IEventMap } from '@domain/Configuration/Ports/IEventConfig.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { EventId } from '@shared/Types/Branded.js';

export class AudioEventOrchestrator {
    constructor(
        private readonly eventMap: IEventMap,
        private readonly router: IAudioRouter,
        private readonly rtpcAdapter: IRTPCAdapter
    ) {}

    public postEvent(eventId: EventId): void {
        const config = this.eventMap[eventId as string];

        if (!config) {
            console.warn(`[EventDispatcher] Event "${eventId}" not found in EventMap.`);
            return;
        }

        const actionsLength = config.actions.length;
        for (let i = 0; i < actionsLength; i++) {
            this.executeAction(config.actions[i]);
        }
    }

    private executeAction(action: EventAction): void {
        switch (action.type) {
            case 'play':
                this.router.play(action.target);
                break;
            case 'stop':
                this.router.stop(action.target, action.options);
                break;
            case 'pause':
                this.router.pause(action.target);
                break;
            case 'resume':
                this.router.resume(action.target);
                break;
            case 'set_rtpc':
                this.rtpcAdapter.setValue(action.param, action.value);
                break;
        }
    }
}
