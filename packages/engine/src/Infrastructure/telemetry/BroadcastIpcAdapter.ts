export class BroadcastIpcAdapter<T> {
    private readonly channel: BroadcastChannel;

    constructor(channelName: string) {
        this.channel = new BroadcastChannel(channelName);
    }

    public send(message: T): void {
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        this.channel.postMessage(message);
    }

    public subscribe(callback: (msg: T) => void): () => void {
        const handler = (event: MessageEvent) => {
            callback(event.data);
        };
        // oxlint-disable-next-line unicorn/prefer-add-event-listener
        this.channel.onmessage = handler;

        return () => {
            // oxlint-disable-next-line unicorn/prefer-add-event-listener
            this.channel.onmessage = null;
        };
    }

    public dispose(): void {
        this.channel.close();
    }
}
