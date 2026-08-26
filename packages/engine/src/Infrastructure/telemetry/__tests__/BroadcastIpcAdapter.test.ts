import fc from 'fast-check';
// oxlint-disable import/no-named-as-default-member
import { describe, it, expect, afterEach } from 'vitest';

import { BroadcastIpcAdapter } from '../BroadcastIpcAdapter.js';

describe('BroadcastIpcAdapter', () => {
    let sender: BroadcastIpcAdapter<unknown>;
    let receiver: BroadcastIpcAdapter<unknown>;

    afterEach(() => {
        sender?.dispose();
        receiver?.dispose();
    });

    describe('send & subscribe', () => {
        it('should deliver messages between adapters on the same channel', async () => {
            const channelName = 'user-notifications';
            sender = new BroadcastIpcAdapter<{ event: string }>(channelName);
            receiver = new BroadcastIpcAdapter<{ event: string }>(channelName);

            const received: { event: string }[] = [];
            receiver.subscribe(msg => {
                received.push(msg as { event: string });
            });

            const message = { event: 'USER_LOGIN' };

            sender.send(message);
            await waitForMessageDelivery();

            expect(received).toEqual([message]);
        });

        it('should stop delivering messages once unsubscribed', async () => {
            const channelName = 'status-updates';
            sender = new BroadcastIpcAdapter<string>(channelName);
            receiver = new BroadcastIpcAdapter<string>(channelName);

            const received: string[] = [];
            const unsubscribe = receiver.subscribe(msg => {
                received.push(msg as string);
            });

            sender.send('message-1');
            await waitForMessageDelivery();

            unsubscribe();

            sender.send('message-2');
            await waitForMessageDelivery();

            expect(received).toEqual(['message-1']);
        });

        it('should isolate messages across different channel names', async () => {
            const primaryChannel = 'orders';
            const secondaryChannel = 'inventory';

            sender = new BroadcastIpcAdapter<string>(primaryChannel);
            receiver = new BroadcastIpcAdapter<string>(secondaryChannel);

            const received: string[] = [];
            receiver.subscribe(msg => {
                received.push(msg as string);
            });

            sender.send('ORDER_PLACED');
            await waitForMessageDelivery();

            expect(received).toEqual([]);
        });

        it('should not deliver sent messages back to the sending adapter instance', async () => {
            const channelName = 'self-isolation';
            sender = new BroadcastIpcAdapter<string>(channelName);

            const received: string[] = [];
            sender.subscribe(msg => {
                received.push(msg as string);
            });

            sender.send('PING');
            await waitForMessageDelivery();

            expect(received).toEqual([]);
        });

        it('should faithfully transmit any structured cloneable payload', async () => {
            await fc.assert(
                fc.asyncProperty(fc.string({ minLength: 1 }), fc.jsonValue(), async (channelName, payload) => {
                    const localSender = new BroadcastIpcAdapter<unknown>(channelName);
                    const localReceiver = new BroadcastIpcAdapter<unknown>(channelName);

                    try {
                        let receivedPayload;
                        localReceiver.subscribe(data => {
                            receivedPayload = data;
                        });

                        localSender.send(payload);
                        await waitForMessageDelivery();

                        expect(receivedPayload).toEqual(payload);
                    } finally {
                        localSender.dispose();
                        localReceiver.dispose();
                    }
                })
            );
        });
    });

    describe('dispose', () => {
        it('should stop receiving messages after disposal', async () => {
            const channelName = 'lifecycle-events';
            sender = new BroadcastIpcAdapter<string>(channelName);
            receiver = new BroadcastIpcAdapter<string>(channelName);

            const received: string[] = [];
            receiver.subscribe(msg => {
                received.push(msg as string);
            });

            receiver.dispose();
            sender.send('AFTER_DISPOSE');
            await waitForMessageDelivery();

            expect(received).toEqual([]);
        });
    });
});

function waitForMessageDelivery(delayMs = 10): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}
