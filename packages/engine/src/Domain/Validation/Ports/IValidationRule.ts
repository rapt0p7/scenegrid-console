import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';

export interface IValidationRule {
    validate(context: IValidationContext): void;
}

export interface ISoundValidationRule {
    validate(soundId: string, cfg: AnySoundConfig, context: IValidationContext): void;
}
