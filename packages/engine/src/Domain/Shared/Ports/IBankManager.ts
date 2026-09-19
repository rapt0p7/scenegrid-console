import type { BankState } from '@domain/Configuration/Ports/IBankConfig.js';
import type { BankId, Result } from '@scene-grid/shared';

export interface IBankManager {
    getBankState(bankId: BankId): BankState;
    loadBank(bankId: BankId): Promise<Result<void, Error>>;
    unloadBank(bankId: BankId): void;
}
