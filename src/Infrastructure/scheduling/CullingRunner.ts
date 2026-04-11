import * as workerTimers from 'worker-timers';

import type { ICullingArbiter, CullingContext } from '@domain/Culling/Ports/ICullingArbiter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';

export class CullingRunner {
    private timerId: number | null = null;

    // eslint-disable-next-line max-params
    constructor(
        private readonly arbiter: ICullingArbiter,
        private readonly controller: ISoundController,
        private readonly contextProvider: CullingContext,
        private readonly checkIntervalMs: number = 500
    ) {}

    public start(): void {
        if (this.timerId !== null) return;
        this.timerId = workerTimers.setInterval(() => this.tick(), this.checkIntervalMs);
    }

    public stop(): void {
        if (this.timerId !== null) {
            workerTimers.clearInterval(this.timerId);
            this.timerId = null;
        }
    }

    private tick(): void {
        const decisions = this.arbiter.evaluate(this.contextProvider);

        for (const id of decisions.toVirtualize) {
            this.controller.virtualize(id);
        }
        for (const id of decisions.toDevirtualize) {
            this.controller.devirtualize(id);
        }
    }
}
