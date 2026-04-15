import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';

export function isFilterEqual(a: IFilter | null | undefined, b: IFilter | null | undefined): boolean {
    if (a === b) return true;

    if (!a || !b) return false;

    if (a.type !== b.type) return false;

    if (a.type === 'reverb' && b.type === 'reverb') {
        return a.reverbTime === b.reverbTime && a.reverbDecay === b.reverbDecay;
    }

    if (a.type !== 'reverb' && b.type !== 'reverb') {
        return a.frequency === b.frequency && a.Q === b.Q;
    }

    return false;
}
