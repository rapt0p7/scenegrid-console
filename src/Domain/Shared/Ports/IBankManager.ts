import type { BankId } from '@shared/Types/Branded.js';
import type { BankState } from '@domain/Configuration/Ports/IBankConfig.js';

export interface IBankManager {
    getBankState(bankId: BankId): BankState;
    loadBank(bankId: BankId): Promise<void>;
    unloadBank(bankId: BankId): void;
}
