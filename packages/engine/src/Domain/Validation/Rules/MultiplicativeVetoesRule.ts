// noinspection D

import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import { typedEntries } from '@scene-grid/shared';

export default class MultiplicativeVetoesRule implements IValidationRule {
    public validate(context: IValidationContext) {
        const rtpcGainBuses = new Set<string>();

        for (const [busId, busCfg] of typedEntries(context.config.buses || {})) {
            if (busCfg.rtpc?.gain) {
                rtpcGainBuses.add(busId as string);

                if (busCfg.gain !== undefined && busCfg.gain < 1) {
                    context.addWarning(
                        `[Orchestration Rule] Bus "${busId}" is RTPC-driven for gain, but its base gain is ${busCfg.gain}. RTPC values will be scaled down. Consider setting base gain to 1.0.`
                    );
                }
            }
        }

        for (const [snapshotId, snapshot] of typedEntries(context.config.snapshots || {})) {
            if (!snapshot.buses) continue;

            for (const [busId, busState] of typedEntries(snapshot.buses)) {
                if (rtpcGainBuses.has(busId) && busState.gain !== undefined && busState.gain !== 1) {
                    const action = busState.gain === 0 ? 'MUTES' : 'SCALES';
                    context.addWarning(
                        `[Multiplicative Veto] Snapshot "${snapshotId}" explicitly ${action} gain (${busState.gain}) for bus "${busId}", which is RTPC-driven. This overrides the RTPC curve (Final = ${busState.gain} * RTPC).`
                    );
                }
            }
        }
    }
}
