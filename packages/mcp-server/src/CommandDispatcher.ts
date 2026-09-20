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
}
