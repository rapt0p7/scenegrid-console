import type { IMagnetConfig, ISmartLoopSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { RegionId } from '@shared/Types/Branded.js';
import { isAbsent } from '@shared/guards.js';
import { QuantizeType } from '@domain/Orchestration/Ports/ISequencer.js';

export interface ITransitionDecision {
    readonly targetRegion: RegionId;
    readonly transitionRegionName?: RegionId;
    readonly options: {
        readonly quantize: QuantizeType;
        readonly crossfadeDuration?: number;
        readonly tailDurationMs?: number;
        readonly interruptable: boolean;
    };
}

export default class SmartLoopTransitionPolicy {
    constructor(private readonly rtpcAdapter: IRTPCAdapter) {}

    public evaluate(config: ISmartLoopSoundConfig, currentRegion: RegionId): ITransitionDecision | null {
        if (isAbsent(config.smartLoop.magnets)) return null;

        const length = config.smartLoop.magnets.length;
        for (let i = 0; i < length; i++) {
            const magnet: IMagnetConfig = config.smartLoop.magnets[i];

            if (magnet.region !== currentRegion) continue;

            if (magnet.targetRegion === currentRegion) continue;

            const currentValue = this.rtpcAdapter.getValue(magnet.condition.param);

            if (this.checkCondition(currentValue, magnet.condition.operator, magnet.condition.value)) {
                return {
                    targetRegion: magnet.targetRegion,
                    transitionRegionName: magnet.transitionRegionName,
                    options: {
                        quantize: magnet.quantize,
                        crossfadeDuration: magnet.crossfadeDuration,
                        tailDurationMs: magnet.tailDurationMs,
                        interruptable: true
                    }
                };
            }
        }
        return null;
    }

    private checkCondition(current: number, operator: string, target: number): boolean {
        switch (operator) {
            case '>':
                return current > target;
            case '<':
                return current < target;
            case '==':
                return current === target;
            case '>=':
                return current >= target;
            case '<=':
                return current <= target;
            default:
                return false;
        }
    }
}
