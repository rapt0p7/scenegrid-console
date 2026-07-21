import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';

export interface IComponentValidationRule<T> {
    validate(context: IValidationContext, path: string, data: T | undefined): void;
}
