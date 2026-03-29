import type { AudioCtx } from '@webaudio-core/types/IAudioContext.js';

export default class UnlockManager {
    private unlocked = false;

    constructor(private context: AudioCtx) {}

    async unlock(): Promise<void> {
        if (this.unlocked) return;
        if (this.context.state === 'running') {
            this.unlocked = true;
            return;
        }

        try {
            const buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.connect(this.context.destination);
            source.start(0);
        } catch {
            /* empty */
        }

        await this.context.resume();
        this.unlocked = true;
    }
}
