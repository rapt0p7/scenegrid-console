export interface CommandBroadcaster {
    broadcast(message: string): void;
}

export class CommandDispatcher {
    constructor(private server: CommandBroadcaster) {}

    public fireEvent(eventId: string): void {
        this.server.broadcast(
            JSON.stringify({
                type: 'FIRE_EVENT',
                eventId
            })
        );
    }

    public setRtpc(param: string, value: number): void {
        this.server.broadcast(
            JSON.stringify({
                type: 'SET_RTPC',
                param,
                value,
                isOverride: true
            })
        );
    }

    public globalAction(action: string): void {
        this.server.broadcast(
            JSON.stringify({
                type: 'GLOBAL_ACTION',
                action
            })
        );
    }

    public stopAll(): void {
        this.globalAction('STOP_ALL');
    }

    public pauseAll(): void {
        this.globalAction('PAUSE_ALL');
    }

    public resumeAll(): void {
        this.globalAction('RESUME_ALL');
    }

    public applySnapshot(snapshotId: string, fadeTime?: number): void {
        this.server.broadcast(
            JSON.stringify({
                type: 'APPLY_SNAPSHOT',
                snapshotId,
                fadeTime
            })
        );
    }
}
