import type { IInspectorDebugPort } from '@domain/Shared/Ports/IInspectorDebugPort.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { InspectorCommand, Milliseconds } from '@scene-grid/shared';

export class CommandReceiver implements ITickable {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static TICK_RATE: Milliseconds = 16 as Milliseconds;
    private readonly queue: InspectorCommand[] = [];
    constructor(
        private readonly port: MessagePort,
        private readonly enginePort: IInspectorDebugPort
    ) {
        this.port.addEventListener('message', this.handleMessage);
        this.port.start();
    }

    public tick(_currentTimeSec: number, _deltaTimeMs: number): void {
        if (this.queue.length === 0) return;

        const batch = this.queue.splice(0);

        for (let i = 0; i < batch.length; i++) {
            this.processCommand(batch[i]);
        }
    }

    public dispose(): void {
        this.port.removeEventListener('message', this.handleMessage);
    }

    private processCommand(cmd: InspectorCommand): void {
        try {
            switch (cmd.type) {
                case 'FIRE_EVENT':
                    this.enginePort.fireEvent(cmd.eventId);
                    break;
                case 'APPLY_SNAPSHOT':
                    this.enginePort.applySnapshot(cmd.snapshotId, cmd.fadeTime);
                    break;
                case 'SET_RTPC':
                    this.enginePort.setRtpcOverride(cmd.param, cmd.value, cmd.isOverride);
                    break;
                case 'GLOBAL_ACTION':
                    if (cmd.action === 'STOP_ALL') this.enginePort.stopAll();
                    else if (cmd.action === 'PAUSE_ALL') this.enginePort.pauseAll();
                    else if (cmd.action === 'RESUME_ALL') this.enginePort.resumeAll();
                    break;
                case 'CLEAR_ALL_OVERRIDES':
                    this.enginePort.clearAllOverrides();
                    break;
                case 'SET_SWITCH':
                    this.enginePort.setSwitchOverride(cmd.switchId, cmd.currentKey, cmd.isOverride);
                    break;
                case 'PLAY_LOOP':
                    this.enginePort.playLoop(cmd.soundId, cmd.regionName);
                    break;
                case 'STOP_LOOP':
                    this.enginePort.stopLoop(cmd.soundId);
                    break;
                case 'TRANSITION_MUSIC':
                    this.enginePort.transitionMusicTo(
                        cmd.soundId,
                        cmd.targetRegion,
                        cmd.transitionRegionName,
                        cmd.options
                    );
                    break;
                default:
                    console.warn(`[CommandReceiver] Unhandled command type: ${(cmd as any).type}`);
            }
        } catch (error) {
            console.error(`[CommandReceiver] Failed to execute command ${cmd.type}`, error);
        }
    }

    private handleMessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || typeof data !== 'object' || !('type' in data)) return;

        this.queue.push(data as InspectorCommand);
    };
}
