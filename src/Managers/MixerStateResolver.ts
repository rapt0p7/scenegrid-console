import { clamp } from '@webaudio-core';

import { isDefined, isAbsent } from '../helpers/guards';

import type { IFilter } from '../interfaces/IFilter.js';
import type { MixerSnapshot, MixerState } from '../interfaces/IMixerStateManager.js';
import type { IRTPCConfig, RTPCTargetProperty } from '../interfaces/IRTPCManager.js';

export interface MixerResolverOptions {
    defaultBusGain?: number;
    maxGainLimit?: number;
}

const DEFAULT_BUS_GAIN = 1;
const MAX_GAIN = 4;

export default class MixerStateResolver {
    private readonly defaultBusGain: number;
    private readonly maxGainLimit: number;

    constructor(options: MixerResolverOptions = {}) {
        this.defaultBusGain = options.defaultBusGain ?? DEFAULT_BUS_GAIN;
        this.maxGainLimit = options.maxGainLimit ?? MAX_GAIN;
    }

    resolve(base: MixerState, patch: MixerSnapshot): MixerState {
        const resolved: MixerState = {
            buses: {},
            metadata: {
                ...base.metadata,
                ...patch.metadata,
                timestamp: performance.now()
            }
        };

        const busIds = new Set([...Object.keys(base.buses ?? {}), ...Object.keys(patch.buses ?? {})]);

        for (const busId of busIds) {
            resolved.buses[busId] = this.resolveBus(base.buses[busId], patch.buses?.[busId]);
        }

        return resolved;
    }

    private resolveBus(base?: Partial<ResolvedBusState>, patch?: Partial<ResolvedBusState>): ResolvedBusState {
        const baseGain = base?.gain ?? this.defaultBusGain;
        const patchGain = patch?.gain ?? 1;
        const resolvedGain = clamp(baseGain * patchGain, 0, this.maxGainLimit);

        return {
            gain: resolvedGain,
            filter: this.resolveFilter(base?.filter, patch?.filter),
            sidechain: this.resolveSidechain(base?.sidechain, patch?.sidechain),
            sends: this.resolveSends(base?.sends, patch?.sends),
            rtpc: this.resolveRtpc(base?.rtpc, patch?.rtpc)
        };
    }

    private resolveSends(
        base?: Record<string, number | null>,
        patch?: Record<string, number | null>
    ): Record<string, number | null> {
        const result = { ...base };

        if (isAbsent(patch)) return result;

        for (const [key, patchValue] of Object.entries(patch)) {
            if (patchValue === null) {
                delete result[key];
            } else {
                const baseValue = base?.[key];

                result[key] = isDefined(baseValue)
                    ? clamp(baseValue * patchValue, 0, this.maxGainLimit)
                    : clamp(patchValue, 0, this.maxGainLimit);
            }
        }

        return result;
    }

    private resolveFilter(base?: IFilter | null, patch?: IFilter | null): IFilter | null {
        if (patch === null) return null;
        if (isDefined(patch)) return patch;
        return base ?? null;
    }

    private resolveSidechain(base?: { enabled: boolean }, patch?: Partial<{ enabled: boolean }>): { enabled: boolean } {
        return {
            enabled: patch?.enabled ?? base?.enabled ?? false
        };
    }

    private resolveRtpc(
        base?: Partial<Record<RTPCTargetProperty, IRTPCConfig>>,
        patch?: Partial<Record<RTPCTargetProperty, IRTPCConfig | null>> | null
    ): Partial<Record<RTPCTargetProperty, IRTPCConfig>> {
        if (patch === null) return {};

        if (isAbsent(patch)) return isDefined(base) ? { ...base } : {};

        const result: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = { ...base };

        for (const key of Object.keys(patch) as RTPCTargetProperty[]) {
            const patchValue = patch[key];

            if (patchValue === null) {
                delete result[key];
            } else if (isDefined(patchValue)) {
                result[key] = patchValue;
            }
        }

        return result;
    }
}

interface ResolvedBusState {
    gain: number;
    filter: IFilter | null;
    sidechain: { enabled: boolean };
    sends: Record<string, number | null>;
    rtpc: Partial<Record<RTPCTargetProperty, IRTPCConfig>>;
}
