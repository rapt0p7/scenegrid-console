// noinspection D

import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import { isAbsent, isDefined, typedEntries } from '@scene-grid/shared';
import type { IBaseSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';

export default class GhostDuckingRule implements IValidationRule {
    public validate(context: IValidationContext) {
        if (isAbsent(context.config.snapshots) || isAbsent(context.config.soundMap) || isAbsent(context.config.buses))
            return;

        const validBuses = Object.keys(context.config.buses);

        for (const [soundId, soundCfg] of typedEntries(context.config.soundMap)) {
            if (typeof soundCfg !== 'object' || soundCfg === null) continue;

            const ducking = (soundCfg as IBaseSoundConfig).ducking;
            const parentBusId = (soundCfg as IBaseSoundConfig).busId;

            if (isAbsent(ducking) || isAbsent(parentBusId) || !validBuses.includes(parentBusId)) continue;

            const duckingTargets = Array.isArray(ducking.target) ? ducking.target : [ducking.target];

            for (const [snapshotId, snapshotCfg] of typedEntries(context.config.snapshots)) {
                if (isAbsent(snapshotCfg.buses)) continue;

                let logicalGain: number;

                const snapshotBus = snapshotCfg.buses[parentBusId];
                if (isDefined(snapshotBus) && isDefined(snapshotBus.gain)) {
                    logicalGain = snapshotBus.gain;
                } else {
                    const defaultBus = context.config.buses[parentBusId];
                    logicalGain = isDefined(defaultBus?.gain) ? defaultBus.gain : 1;
                }

                if (logicalGain === 0) {
                    context.addWarning(
                        `Ghost Ducking Risk: Sound "${soundId}" on bus "${parentBusId}" triggers ducking on [${duckingTargets.join(', ')}]. ` +
                            `However, bus "${parentBusId}" has a logical gain of 0 in snapshot "${snapshotId}". ` +
                            `This will cause silent ducking.`
                    );
                }
            }
        }
    }
}
