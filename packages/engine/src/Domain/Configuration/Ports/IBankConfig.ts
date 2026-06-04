import type { BankId, SoundId } from '@scene-grid/shared';

export type BankState = 'UNLOADED' | 'LOADING' | 'LOADED' | 'ERROR';

export interface IBankConfig {
    readonly id: BankId;
    readonly sounds: readonly SoundId[];
}

export type IBankManifest = Record<string, IBankConfig>;
