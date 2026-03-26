import mitt from 'mitt';

import type { IRTPCManager, RTPCEvents } from '../interfaces/IRTPCManager';
import type { Emitter } from 'mitt';

export default class RTPCManager implements IRTPCManager {
    public readonly events: Emitter<RTPCEvents> = mitt<RTPCEvents>();
    private values: Map<string, number> = new Map();
    private dirtyParams: Set<string> = new Set();
    private isUpdateScheduled = false;

    public setValue(parameterName: string, value: number): void {
        if (this.values.get(parameterName) === value) return;

        this.values.set(parameterName, value);
        this.dirtyParams.add(parameterName);

        this.scheduleUpdate();
    }

    public setValues(parameters: Record<string, number>): void {
        for (const [key, value] of Object.entries(parameters)) {
            this.setValue(key, value);
        }
    }

    public getValue(parameterName: string, defaultValue: number = 0): number {
        return this.values.get(parameterName) ?? defaultValue;
    }

    public reset(): void {
        this.values.clear();
        this.dirtyParams.clear();
        this.isUpdateScheduled = false;
        this.events.all.clear();
    }

    private scheduleUpdate(): void {
        if (this.isUpdateScheduled) return;
        this.isUpdateScheduled = true;

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve().then(() => this.flush());
    }

    private flush(): void {
        this.isUpdateScheduled = false;

        for (const parameter of this.dirtyParams) {
            const value = this.values.get(parameter);
            if (value !== undefined) {
                this.events.emit(parameter, value);
            }
        }

        this.dirtyParams.clear();
    }
}
