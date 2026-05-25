import type { BankId, SoundId } from '@shared/Types/Branded.js';

export type BankState = 'UNLOADED' | 'LOADING' | 'LOADED' | 'ERROR';

export interface IBankConfig {
    readonly id: BankId;
    readonly sounds: readonly SoundId[];
}

export type IBankManifest = Record<string, IBankConfig>;
