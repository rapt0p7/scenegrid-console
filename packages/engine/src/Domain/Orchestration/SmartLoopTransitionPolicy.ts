import type { IMagnetConfig, ISmartLoopSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { RegionId, QuantizeType, IConditionTrace, Milliseconds } from '@scene-grid/shared';
import { isAbsent } from '@scene-grid/shared';
import { ConditionEvaluator } from '@domain/Shared/Evaluators/ConditionEvaluator.js';

export interface ITransitionDecision {
    readonly targetRegion: RegionId;
    readonly transitionRegionName?: RegionId;
    readonly options: {
        readonly quantize: QuantizeType;
        readonly crossfadeDuration?: Milliseconds;
        readonly tailDuration?: Milliseconds;
        readonly interruptable: boolean;
    };
    readonly trace: IConditionTrace;
}

export default class SmartLoopTransitionPolicy {
    constructor(private readonly rtpcAdapter: IRTPCAdapter) {}

    // oxlint-disable-next-line max-lines-per-function
    public evaluate(
        config: ISmartLoopSoundConfig,
        currentRegion: RegionId,
        magnetStates: boolean[]
    ): ITransitionDecision | null {
        if (isAbsent(config.smartLoop.magnets)) return null;

        const length = config.smartLoop.magnets.length;
        for (let i = 0; i < length; i++) {
            const magnet: IMagnetConfig = config.smartLoop.magnets[i];

            if (magnet.region !== currentRegion) continue;
            if (magnet.targetRegion === currentRegion) continue;

            const currentValue = this.rtpcAdapter.getValue(magnet.condition.param);

            const previouslyMet = magnetStates[i];

            const isMet = ConditionEvaluator.evaluate(
                currentValue,
                magnet.condition.operator,
                magnet.condition.value,
                magnet.condition.hysteresis,
                previouslyMet
            );

            magnetStates[i] = isMet;

            if (isMet) {
                return {
                    targetRegion: magnet.targetRegion,
                    transitionRegionName: magnet.transitionRegionName,
                    options: {
                        quantize: magnet.quantize,
                        crossfadeDuration: magnet.crossfadeDuration,
                        tailDuration: magnet.tailDuration,
                        interruptable: true
                    },
                    trace: {
                        param: magnet.condition.param,
                        operator: magnet.condition.operator,
                        threshold: magnet.condition.value,
                        actualValue: currentValue,
                        passed: true,
                        hysteresisDeadZone: magnet.condition.hysteresis
                            ? [
                                  magnet.condition.value - magnet.condition.hysteresis,
                                  magnet.condition.value + magnet.condition.hysteresis
                              ]
                            : undefined
                    }
                };
            }
        }
        return null;
    }
}
