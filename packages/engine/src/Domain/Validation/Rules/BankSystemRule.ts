// oxlint-disable max-depth max-lines-per-function
// noinspection D

import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import { isAbsent, isDefined, typedEntries } from '@scene-grid/shared';

export default class BankSystemRule implements IValidationRule {
    public validate(context: IValidationContext) {
        if (isAbsent(context.config.banks) || Object.keys(context.config.banks).length === 0) {
            context.addWarning('No banks defined. The engine will not be able to load any sounds.');
            return;
        }

        if (!context.assertOptionalType('banks', context.config.banks, 'object')) return;

        const soundToBanks = new Map<string, string[]>();

        for (const [bankId, bankCfg] of typedEntries(context.config.banks)) {
            if (!context.assertRequiredType(`banks.${bankId}`, bankCfg, 'object')) continue;
            if (!context.assertArray(`banks.${bankId}.sounds`, bankCfg.sounds, false)) continue;

            for (const soundId of bankCfg.sounds) {
                if (typeof soundId !== 'string') {
                    context.addError(`Bank "${bankId}" contains non-string sound ID.`);
                    continue;
                }

                if (!soundToBanks.has(soundId)) {
                    soundToBanks.set(soundId, []);
                }
                soundToBanks.get(soundId)!.push(bankId);

                if (
                    context.config.soundMap &&
                    context.config.manifest &&
                    !context.config.soundMap[soundId as any] &&
                    !context.config.manifest[soundId as any]
                ) {
                    context.addError(`Bank "${bankId}" references missing sound "${soundId}".`);
                }
            }
        }

        for (const [soundId, bankList] of soundToBanks.entries()) {
            if (bankList.length > 1) {
                context.addError(
                    `Critical: Sound "${soundId}" is duplicated in multiple banks: [${bankList.join(', ')}]. Extract it to a shared bank.`
                );
            }
        }

        for (const [soundId, cfg] of typedEntries(context.config.soundMap || {})) {
            if (context.isContainer(cfg as any) || context.isScatterer(cfg as any) || context.isSwitch(cfg as any)) {
                continue;
            }

            if (!soundToBanks.has(soundId)) {
                context.addError(
                    `Sound "${soundId}" exists in SoundMap but is not assigned to any Bank. It will never be loaded.`
                );
            }
        }

        for (const [soundId, cfg] of typedEntries(context.config.soundMap || {})) {
            if (typeof cfg !== 'object' || cfg === null) continue;

            if (context.isContainer(cfg) || context.isScatterer(cfg)) {
                const sources = cfg.sources;
                if (Array.isArray(sources)) {
                    const referencedBanks = new Set<string>();
                    for (const source of sources) {
                        if (isDefined(source)) {
                            const targetId =
                                typeof source === 'string' ? source : (source as Record<string, unknown>).id;
                            const banksForTarget = soundToBanks.get(targetId as string);
                            if (banksForTarget && banksForTarget.length > 0) {
                                referencedBanks.add(banksForTarget[0]);
                            }
                        }
                    }

                    if (referencedBanks.size > 1) {
                        context.addWarning(
                            `Container/Scatterer "${soundId}" uses sounds from different banks: [${Array.from(referencedBanks).join(', ')}]. Ensure they are loaded together to avoid missing sounds.`
                        );
                    }
                }
            }
        }
    }
}
