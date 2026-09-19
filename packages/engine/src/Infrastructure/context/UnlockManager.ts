// oxlint-disable unicorn/no-useless-undefined
import type { AudioCtx } from '@infrastructure/types/IAudioContext.js';

import { Result, Ok, Err } from '@scene-grid/shared';

export default class UnlockManager {
    private unlocked = false;

    constructor(private context: AudioCtx) {}

    async unlock(): Promise<Result<void, Error>> {
        if (this.context.state === 'running') {
            this.unlocked = true;
            return Ok(undefined);
        }

        if (!this.unlocked) {
            try {
                const buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
                const source = this.context.createBufferSource();
                source.buffer = buffer;
                source.connect(this.context.destination);
                source.start(0);
            } catch {
                /* empty */
            }
        }

        try {
            await this.context.resume();
            this.unlocked = true;
            return Ok(undefined);
        } catch (error) {
            return Err(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
