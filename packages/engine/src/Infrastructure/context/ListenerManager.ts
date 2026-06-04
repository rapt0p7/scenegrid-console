import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type { AudioCtx } from '@infrastructure/types/IAudioContext.js';

export default class ListenerManager {
    readonly #ctx: AudioCtx;
    readonly #automation: AutomationEngine;
    private readonly SMOOTHING_MS = 50;

    constructor(context: AudioCtx, automation: AutomationEngine) {
        this.#ctx = context;
        this.#automation = automation;
    }

    public setPosition(x: number, y: number, z: number): void {
        const { listener } = this.#ctx;

        if (listener.positionX) {
            this.#automation.ramp(listener.positionX, x, this.SMOOTHING_MS);
            this.#automation.ramp(listener.positionY, y, this.SMOOTHING_MS);
            this.#automation.ramp(listener.positionZ, z, this.SMOOTHING_MS);
        } else if ('setPosition' in listener) {
            (listener as any).setPosition(x, y, z);
        }
    }

    // eslint-disable-next-line max-params
    public setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
        const { listener } = this.#ctx;

        if (listener.forwardX) {
            this.#automation.ramp(listener.forwardX, fx, this.SMOOTHING_MS);
            this.#automation.ramp(listener.forwardY, fy, this.SMOOTHING_MS);
            this.#automation.ramp(listener.forwardZ, fz, this.SMOOTHING_MS);
            this.#automation.ramp(listener.upX, ux, this.SMOOTHING_MS);
            this.#automation.ramp(listener.upY, uy, this.SMOOTHING_MS);
            this.#automation.ramp(listener.upZ, uz, this.SMOOTHING_MS);
        } else if ('setOrientation' in listener) {
            (listener as any).setOrientation(fx, fy, fz, ux, uy, uz);
        }
    }
}
