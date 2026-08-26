import type { ITelemetryLifecycleEvent } from '@scene-grid/shared';

/* eslint-disable @typescript-eslint/naming-convention */
import { bench, describe } from 'vitest';

import { CyclePool } from '../CyclePool.js';

describe('Zero-Allocation: CyclePool vs Dynamic Allocation', () => {
    const POOL_SIZE = 128;

    const pool = new CyclePool<ITelemetryLifecycleEvent>(POOL_SIZE, () => ({
        type: 'LIFECYCLE',
        timestampMs: 0,
        action: 'START',
        playbackId: 0 as any,
        soundId: '' as any,
        reason: undefined
    }));

    bench('CyclePool.getNext() (O(1) Array-Backed Reuse)', () => {
        const event = pool.getNext();
        // @ts-expect-error Writing for test
        event.timestampMs = Date.now();
        // @ts-expect-error Writing for test
        event.playbackId = 42 as any;
    });

    bench('Dynamic Object Allocation (Classic {} instantiation)', () => {
        // oxlint-disable-next-line no-unused-vars
        const event: ITelemetryLifecycleEvent = {
            type: 'LIFECYCLE',
            timestampMs: Date.now(),
            action: 'START',
            playbackId: 42 as any,
            soundId: '' as any,
            reason: undefined
        };
    });
});
