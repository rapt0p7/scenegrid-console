import type { IConsistencyReporter } from '@domain/Validation/Ports/IConsistencyReporter.js';

export interface IConsistencyCheckerOptions {
    readonly reporters?: IConsistencyReporter[];
    readonly isReturnWithReport?: boolean;
}
