import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';

export default class RamQuotaRule implements IValidationRule {
    private static readonly FALLBACK_SIZE_MB = 5.0;

    public validate(context: IValidationContext): void {
        const config = context.config;
        const manifest = config.manifest;

        if (!manifest) return;

        const ramQuotaMb = config.ramQuotaMb ?? 50;
        const precalculatedSizes = config.precalculatedSizes ?? {};

        let totalHighPriorityMb = 0;

        for (const [soundId, soundConfig] of Object.entries(manifest)) {
            const primaryUrl = Array.isArray(soundConfig.url) ? soundConfig.url[0] : soundConfig.url;
            const sizeMb = precalculatedSizes[primaryUrl] ?? RamQuotaRule.FALLBACK_SIZE_MB;

            if (soundConfig.priority === 'high') {
                totalHighPriorityMb += sizeMb;
            }

            if (sizeMb > 15.0) {
                context.addWarning(
                    `Asset '${soundId}' (${primaryUrl}) is ~${sizeMb.toFixed(1)} MB. ` +
                        `Consider moving this to the Hybrid Streaming Player.`
                );
            }
        }

        if (totalHighPriorityMb > ramQuotaMb) {
            context.addError(
                `RAM Quota Breach: High-priority sounds consume ${totalHighPriorityMb.toFixed(1)} MB, ` +
                    `which exceeds the total engine quota of ${ramQuotaMb} MB. ` +
                    `The engine cannot guarantee playback stability.`
            );
        }
    }
}
