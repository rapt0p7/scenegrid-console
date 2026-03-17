import mitt from 'mitt';

import type { IRTPCManager, RTPCEvents } from '../interfaces/IRTPCManager';
import type { Emitter } from 'mitt';

export default class RTPCManager implements IRTPCManager {
    public readonly events: Emitter<RTPCEvents> = mitt<RTPCEvents>();
    private values: Map<string, number> = new Map();

    public setValue(parameterName: string, value: number): void {
        if (this.values.get(parameterName) === value) return;

        this.values.set(parameterName, value);
        this.events.emit(parameterName, value);
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
        this.events.all.clear();
    }
}
