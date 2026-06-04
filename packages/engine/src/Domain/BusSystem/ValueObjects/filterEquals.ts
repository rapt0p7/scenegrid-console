import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';

/**
 * Returns whether two filter definitions are structurally equal.
 *
 * Equality first checks referential identity, then compares filter type and the
 * relevant variant-specific fields:
 * - `reverb`: `reverbTime` and `reverbDecay`
 * - non-`reverb`: `frequency` and `Q`
 *
 * `null` and `undefined` are treated as absent values and are only equal when
 * both references are the same absent value.
 *
 * @param a The first filter to compare.
 * @param b The second filter to compare.
 * @returns `true` when both filters represent the same configuration.
 */
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
