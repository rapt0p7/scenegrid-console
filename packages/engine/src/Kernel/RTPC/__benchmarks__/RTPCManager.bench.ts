import type { GameParamId, Milliseconds } from '@scene-grid/shared';

/* eslint-disable @typescript-eslint/naming-convention */
import { test, describe } from 'vitest';

import RTPCManager from '../RTPCManager.js';

class OopParameter {
    constructor(
        public current: number,
        public target: number,
        public attack: number,
        public release: number
    ) {}

    public tick(deltaTimeSec: number) {
        if (Math.abs(this.current - this.target) < 1e-4) {
            this.current = this.target;
            return;
        }
        const slew = this.target > this.current ? this.attack : this.release;
        if (slew <= 0) {
            this.current = this.target;
        } else {
            const timeConstant = slew / 1000 / 5;
            const alpha = 1 - Math.exp(-deltaTimeSec / Math.max(0.001, timeConstant));
            this.current = this.current + (this.target - this.current) * alpha;
        }
    }
}

describe('RTPCManager: Flat SoA vs OOP AoS Loop', () => {
    const PARAM_COUNT = 256;
    const deltaTime = 16 as Milliseconds;

    const kernelManager = new RTPCManager();
    for (let i = 0; i < PARAM_COUNT; i++) {
        const id = `param_${i}` as GameParamId;
        kernelManager.configureParam(id, 100 as Milliseconds, 200 as Milliseconds);
        kernelManager.setValue(id, 1.0);
    }

    const oopParameters: OopParameter[] = Array.from({ length: PARAM_COUNT }, () => new OopParameter(0, 1.0, 100, 200));

    test('Kernel RTPCManager (Structure of Arrays - Float32Array)', async ({ bench }) => {
        await bench('Kernel RTPCManager (Structure of Arrays - Float32Array)', () => {
            kernelManager.tick(0, deltaTime);
        }).run();
    });

    test('OOP Array-of-Objects Iteration (Standard Pointer Chasing)', async ({ bench }) => {
        await bench('OOP Array-of-Objects Iteration (Standard Pointer Chasing)', () => {
            const dtSec = 16 / 1000;
            for (let i = 0; i < PARAM_COUNT; i++) {
                oopParameters[i].tick(dtSec);
            }
        }).run();
    });
});
