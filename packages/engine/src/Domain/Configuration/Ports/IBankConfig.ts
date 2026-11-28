import type { BankId, SoundId } from '@scene-grid/shared';

export type BankState = 'UNLOADED' | 'LOADING' | 'LOADED' | 'ERROR';

/**
 * Configuration for a single audio bank.
 * Bank identity is defined authoritatively by the map key in {@link IBankManifest}.
 */
export interface IBankConfig {
    /** Optional informational/legacy bank identifier; runtime bank loading, events, and validation use the {@link IBankManifest} map key. */
    readonly id?: BankId;
    readonly sounds: readonly SoundId[];
}

/** Map of authoritative {@link BankId} keys to bank configurations. */
export type IBankManifest = Record<string, IBankConfig>;
