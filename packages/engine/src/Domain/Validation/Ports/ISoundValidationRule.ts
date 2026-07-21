import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';

export interface ISoundValidationRule {
    validate(soundId: string, cfg: AnySoundConfig, context: IValidationContext): void;
}
