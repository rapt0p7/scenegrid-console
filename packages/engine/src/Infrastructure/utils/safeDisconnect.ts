import type { AudioNodeLike } from '@infrastructure/types/IAudioContext.js';

export function safeDisconnect(node?: AudioNodeLike, output: AudioNodeLike | null = null): void {
    if (!node) return;

    try {
        if (output) {
            node.disconnect(output);
            return;
        }

        if (node.numberOfOutputs === 0) return;

        node.disconnect();
    } catch {
        try {
            const max = node.numberOfOutputs;
            for (let index = 0; index < max; index++) {
                try {
                    node.disconnect(index);
                } catch {
                    /* empty */
                }
            }
        } catch {
            /* empty */
        }
    }
}
