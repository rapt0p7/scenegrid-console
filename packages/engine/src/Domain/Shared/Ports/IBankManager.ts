import type { BankId } from '@scene-grid/shared';
import type { BankState } from '@domain/Configuration/Ports/IBankConfig.js';

export interface IBankManager {
    getBankState(bankId: BankId): BankState;
    loadBank(bankId: BankId): Promise<void>;
    unloadBank(bankId: BankId): void;
}
