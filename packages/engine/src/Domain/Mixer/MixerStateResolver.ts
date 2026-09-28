// noinspection D

import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { MixerSnapshot, MixerState, Sends } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';
import type { BusId, DeepReadonly } from '@scene-grid/shared';

import { isDefined, isAbsent, clamp, typedEntries, typedKeys } from '@scene-grid/shared';

export interface MixerResolverOptions {
    readonly defaultBusGain?: number;
    readonly maxGainLimit?: number;
}

const DEFAULT_BUS_GAIN = 1;
const MAX_GAIN = 4;

export default class MixerStateResolver {
    private readonly defaultBusGain: number;
    private readonly maxGainLimit: number;

    constructor(options: DeepReadonly<MixerResolverOptions> = {}) {
        this.defaultBusGain = options.defaultBusGain ?? DEFAULT_BUS_GAIN;
        this.maxGainLimit = options.maxGainLimit ?? MAX_GAIN;
    }

    resolve(base: DeepReadonly<MixerState>, patch: DeepReadonly<MixerSnapshot>): DeepReadonly<MixerState> {
        const resolvedBuses: Record<string, DeepReadonly<ResolvedBusState>> = {};

        const busIds = new Set([...Object.keys(base.buses ?? {}), ...Object.keys(patch.buses ?? {})]);

        for (const busId of busIds) {
            resolvedBuses[busId] = this.resolveBus(base.buses?.[busId as BusId], patch.buses?.[busId as BusId]);
        }

        return {
            buses: resolvedBuses,
            metadata: {
                ...base.metadata,
                ...patch.metadata,
                timestamp: performance.now()
            }
        };
    }

    private resolveBus(
        base?: DeepReadonly<Partial<ResolvedBusState>>,
        patch?: DeepReadonly<Partial<ResolvedBusState>>
    ): DeepReadonly<ResolvedBusState> {
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

    private resolveSends(base?: DeepReadonly<Sends>, patch?: DeepReadonly<Sends>): DeepReadonly<Sends> {
        if (isAbsent(patch)) {
            return isDefined(base) ? { ...base } : {};
        }

        const result: Record<string, number> = { ...(base as Record<string, number>) };

        for (const [key, patchValue] of typedEntries(patch)) {
            if (patchValue === null) {
                delete result[key];
            } else if (isDefined(patchValue)) {
                const baseValue = base?.[key];

                result[key] = isDefined(baseValue)
                    ? clamp(baseValue * patchValue, 0, this.maxGainLimit)
                    : clamp(patchValue, 0, this.maxGainLimit);
            }
        }

        return result;
    }

    private resolveFilter(
        base?: DeepReadonly<IFilter> | null,
        patch?: DeepReadonly<IFilter> | null
    ): DeepReadonly<IFilter> | null {
        if (patch === null) return null;
        if (isDefined(patch)) return patch;
        return base ?? null;
    }

    private resolveSidechain(
        base?: DeepReadonly<{ enabled: boolean }>,
        patch?: DeepReadonly<Partial<{ enabled: boolean }>>
    ): DeepReadonly<{ enabled: boolean }> {
        return {
            enabled: patch?.enabled ?? base?.enabled ?? false
        };
    }

    private resolveRtpc(
        base?: DeepReadonly<Partial<Record<RTPCTargetProperty, IRTPCConfig>>>,
        patch?: DeepReadonly<Partial<Record<RTPCTargetProperty, IRTPCConfig | null>>> | null
    ): DeepReadonly<Partial<Record<RTPCTargetProperty, IRTPCConfig>>> {
        if (patch === null) return {};

        if (isAbsent(patch)) {
            return isDefined(base) ? { ...base } : {};
        }

        const result: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            ...(base as Partial<Record<RTPCTargetProperty, IRTPCConfig>>)
        };

        for (const key of typedKeys(patch)) {
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

export interface ResolvedBusState {
    readonly gain: number;
    readonly filter: IFilter | null;
    readonly sidechain: { readonly enabled: boolean };
    readonly sends: Record<string, number | null>;
    readonly rtpc: Partial<Record<RTPCTargetProperty, IRTPCConfig>>;
}
