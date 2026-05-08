import type { ICullingArbiter, ICullingContext } from '@domain/Culling/Ports/ICullingArbiter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';

export class CullingRunner {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static TICK_RATE_MS = 500;
    constructor(
        private readonly arbiter: ICullingArbiter,
        private readonly controller: ISoundController,
        private readonly contextProvider: ICullingContext
    ) {}

    public tick(audioCurrentTime: number, deltaTimeMs: number): void {
        const decisions = this.arbiter.evaluate(this.contextProvider, deltaTimeMs);

        for (const id of decisions.toVirtualize) {
            this.controller.virtualize(id);
        }
        for (const id of decisions.toDevirtualize) {
            this.controller.devirtualize(id);
        }
    }
}
