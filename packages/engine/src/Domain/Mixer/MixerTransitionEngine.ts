// noinspection D

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type { IBus } from '@domain/BusSystem/Ports/IBuses.js';
import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ITransitionOptions, MixerState, Sends } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';
import type { BusId, DeepReadonly } from '@scene-grid/shared';
import type { Emitter } from 'mitt';

import { isFilterEqual } from '@domain/BusSystem/ValueObjects/filterEquals.js';
import { isDefined, type Milliseconds, typedEntries, typedKeys } from '@scene-grid/shared';
import mitt from 'mitt';

type BusTransitionConfig = DeepReadonly<MixerState['buses'][BusId]>;

type MixerFSMState =
    | { type: 'IDLE' }
    | {
          type: 'FADE_OUT_FILTERS' | 'RUNNING_TRANSITION';
          target: MixerState;
          elapsed: Milliseconds;
          totalDuration: Milliseconds;
          filterPhaseDuration: Milliseconds;
          isInterruptible: boolean;
      };

export default class MixerTransitionEngine {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static TICK_DIVIDER: number = 1;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public readonly events: Emitter<{ 'transition:start': { duration: Milliseconds } }> = mitt();

    private current: MixerState = { buses: {} };
    private state: MixerFSMState = { type: 'IDLE' };
    private isInitialized = false;

    constructor(
        private readonly busSystem: IAudioBusSystem,
        private readonly rtpcAdapter: IRTPCAdapter
    ) {}

    public getState(): MixerState {
        return structuredClone(this.current);
    }

    public applyState(
        next: DeepReadonly<MixerState>,
        { duration = 500 as Milliseconds, interruptible = true }: DeepReadonly<ITransitionOptions> = {}
    ): void {
        if (this.state.type !== 'IDLE' && !this.state.isInterruptible) {
            return;
        }

        for (const [busId, nextBusConfig] of Object.entries(next.buses)) {
            const bus = this.busSystem.getBus(busId as BusId);
            if (bus) {
                bus.logicalTargetGain = nextBusConfig.gain ?? 0;
            }
        }

        this.events.emit('transition:start', { duration });

        if (!this.isInitialized || duration <= 0) {
            this.forceInstantTransition(next);
            return;
        }

        const filterPhaseDuration = (duration * 0.25) as Milliseconds;

        this.state = {
            type: 'FADE_OUT_FILTERS',
            target: next,
            elapsed: 0 as Milliseconds,
            totalDuration: duration,
            filterPhaseDuration,
            isInterruptible: interruptible
        };

        this.startFilterPhase(next, filterPhaseDuration);
    }

    public cancelActiveTransition(): void {
        if (this.state.type === 'IDLE') return;
        this.state = { type: 'IDLE' };
    }

    public tick(currentTime: number, dt: Milliseconds): void {
        if (this.state.type === 'IDLE') return;

        const s = this.state;
        s.elapsed = (s.elapsed + dt) as Milliseconds;

        if (s.type === 'FADE_OUT_FILTERS' && s.elapsed >= s.filterPhaseDuration) {
            const remainingTime = Math.max(0, s.totalDuration - s.elapsed) as Milliseconds;
            this.startMainTransitionPhase(s.target, remainingTime);
            s.type = 'RUNNING_TRANSITION';
        }

        if (s.elapsed >= s.totalDuration) {
            this.completeTransition(s.target);
        }
    }

    private getBaseConfig(busId: BusId): IBus {
        if (typeof this.busSystem.getBaseBusConfig === 'function') {
            return this.busSystem.getBaseBusConfig(busId) ?? {};
        }
        return {};
    }

    private resolveBusGain(busConfig: BusTransitionConfig | undefined, baseConfig: IBus): number {
        return isDefined(busConfig?.gain) ? busConfig.gain : (baseConfig.gain ?? 0);
    }

    private resolveBusFilter(busConfig: BusTransitionConfig | undefined, baseConfig: IBus): IFilter | null {
        return isDefined(busConfig?.filter) ? busConfig.filter : (baseConfig.filter ?? null);
    }

    private resolveBusSends(
        busConfig: BusTransitionConfig | undefined,
        baseConfig: IBus
    ): DeepReadonly<Sends> | IBus['sends'] {
        return isDefined(busConfig?.sends) ? busConfig.sends : baseConfig.sends;
    }

    private applySends(busId: BusId, sends: DeepReadonly<Sends> | IBus['sends'], duration: Milliseconds): void {
        if (!sends) return;

        for (const [targetBusId, sendGain] of typedEntries(sends)) {
            this.busSystem.applySend(busId, targetBusId, sendGain, duration);
        }
    }

    private clearRemovedSends(
        busId: BusId,
        previousSends: DeepReadonly<Sends> | IBus['sends'],
        nextSends: DeepReadonly<Sends> | IBus['sends'],
        duration: Milliseconds
    ): void {
        if (!previousSends) return;

        for (const targetBusId of typedKeys(previousSends)) {
            if (!nextSends || !isDefined(nextSends[targetBusId])) {
                this.busSystem.applySend(busId, targetBusId, null, duration);
            }
        }
    }

    private forceInstantTransition(target: DeepReadonly<MixerState>): void {
        for (const [busId, bus] of this.busSystem.getAllBuses()) {
            const nextBusConfig = target.buses[busId];
            const baseConfig = this.getBaseConfig(busId);

            bus.setGainImmediate(this.resolveBusGain(nextBusConfig, baseConfig));
            bus.safeReplaceFilter(this.resolveBusFilter(nextBusConfig, baseConfig), 0 as Milliseconds);
            this.applySends(busId, this.resolveBusSends(nextBusConfig, baseConfig), 0 as Milliseconds);
        }

        this.completeTransition(target);
    }

    private startFilterPhase(target: DeepReadonly<MixerState>, filterPhaseDuration: Milliseconds): void {
        for (const [busId, bus] of this.busSystem.getAllBuses()) {
            const nextBusConfig = target.buses[busId];
            const previousBusConfig = this.current.buses[busId];
            const baseConfig = this.getBaseConfig(busId);

            const nextFilter = this.resolveBusFilter(nextBusConfig, baseConfig);
            const previousFilter = this.resolveBusFilter(previousBusConfig, baseConfig);

            if (!isFilterEqual(previousFilter, nextFilter)) {
                bus.safeReplaceFilter(nextFilter, filterPhaseDuration);
            }

            const nextRtpc = isDefined(nextBusConfig?.rtpc) ? nextBusConfig.rtpc : baseConfig.rtpc;
            if (isDefined(nextRtpc)) {
                bus.bindRTPC(nextRtpc, this.rtpcAdapter);
            }
        }
    }

    private startMainTransitionPhase(target: DeepReadonly<MixerState>, remainingTime: Milliseconds): void {
        for (const [busId, bus] of this.busSystem.getAllBuses()) {
            const nextBusConfig = target.buses[busId];
            const previousBusConfig = this.current.buses[busId];
            const baseConfig = this.getBaseConfig(busId);

            const nextGain = this.resolveBusGain(nextBusConfig, baseConfig);
            const previousGain = this.resolveBusGain(previousBusConfig, baseConfig);

            if (nextGain !== previousGain) {
                bus.setLogicalGain(nextGain, remainingTime);
            }

            const nextSends = this.resolveBusSends(nextBusConfig, baseConfig);
            const previousSends = this.resolveBusSends(previousBusConfig, baseConfig);

            this.applySends(busId, nextSends, remainingTime);
            this.clearRemovedSends(busId, previousSends, nextSends, remainingTime);
        }
    }

    private completeTransition(target: DeepReadonly<MixerState>): void {
        this.current = target;
        this.state = { type: 'IDLE' };
        this.isInitialized = true;
    }
}
