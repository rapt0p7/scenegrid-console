// oxlint-disable max-depth max-lines-per-function
// noinspection D

import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import { isAbsent, isDefined, typedEntries } from '@scene-grid/shared';
import { RTPCRule } from '@domain/Validation/Rules/RTPCRule.js';

export default class SnapshotsRule implements IValidationRule {
    constructor(private readonly rtpcRule = new RTPCRule()) {}

    public validate(context: IValidationContext) {
        const validBuses = Object.keys(context.config.buses || {});

        for (const [snapshotId, snapshot] of typedEntries(context.config.snapshots || {})) {
            if (!context.assertRequiredType(`snapshots.${snapshotId}`, snapshot, 'object')) continue;

            if (isAbsent(snapshot.buses)) continue;
            if (!context.assertOptionalType(`snapshots.${snapshotId}.buses`, snapshot.buses, 'object')) continue;

            for (const [busId, busState] of typedEntries(snapshot.buses)) {
                if (!context.assertRequiredType(`snapshots.${snapshotId}.buses.${busId}`, busState, 'object')) continue;

                if (!validBuses.includes(busId)) {
                    context.addError(`Snapshot "${snapshotId}" refers to unknown bus "${busId}"`);
                }

                if (isDefined(busState.gain)) {
                    context.assertOptionalType(`snapshots.${snapshotId}.buses.${busId}.gain`, busState.gain, 'number');
                }

                if (isDefined(busState.filter)) {
                    context.assertRequiredType(
                        `snapshots.${snapshotId}.buses.${busId}.filter.type`,
                        busState.filter.type,
                        'string'
                    );
                }

                if (isDefined(busState.sends)) {
                    context.assertOptionalType(
                        `snapshots.${snapshotId}.buses.${busId}.sends`,
                        busState.sends,
                        'object'
                    );
                    for (const [targetBus, sendGain] of typedEntries(busState.sends)) {
                        context.assertOptionalType(
                            `snapshots.${snapshotId}.buses.${busId}.sends.${targetBus}`,
                            sendGain,
                            'number'
                        );
                        if (!validBuses.includes(targetBus)) {
                            context.addError(
                                `Snapshot "${snapshotId}" bus "${busId}" sends to unknown bus "${targetBus}"`
                            );
                        }
                    }
                }

                this.rtpcRule.validate(context, `snapshots.${snapshotId}.buses.${busId}`, busState.rtpc);
            }
        }
    }
}
