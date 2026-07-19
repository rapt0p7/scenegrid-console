// noinspection D

import mitt from 'mitt';

import { isFilterEqual } from '@domain/BusSystem/ValueObjects/filterEquals.js';
import { isDefined, type Milliseconds, typedEntries, typedKeys } from '@scene-grid/shared';

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ITransitionOptions, MixerState } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';
import type { BusId, DeepReadonly } from '@scene-grid/shared';
import type { Emitter } from 'mitt';
import type { IBus } from '@domain/BusSystem/Ports/IBuses.js';

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
    public static TICK_RATE: Milliseconds = 16 as Milliseconds;
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

    private forceInstantTransition(target: DeepReadonly<MixerState>): void {
        for (const [busId, bus] of this.busSystem.getAllBuses()) {
            const nextBusConfig = target.buses[busId];
            const baseConfig = this.getBaseConfig(busId);

            const targetGain = isDefined(nextBusConfig?.gain) ? nextBusConfig.gain : (baseConfig.gain ?? 0);
            bus.setGainImmediate(targetGain);

            const targetFilter = isDefined(nextBusConfig?.filter) ? nextBusConfig.filter : (baseConfig.filter ?? null);
            bus.safeReplaceFilter(targetFilter, 0 as Milliseconds);

            const targetSends = isDefined(nextBusConfig?.sends) ? nextBusConfig.sends : baseConfig.sends;
            if (targetSends) {
                for (const [targetBusId, sendGain] of typedEntries(targetSends)) {
                    this.busSystem.applySend(busId, targetBusId, sendGain, 0 as Milliseconds);
                }
            }
        }

        this.current = target;
        this.state = { type: 'IDLE' };
        this.isInitialized = true;
    }

    private startFilterPhase(target: DeepReadonly<MixerState>, filterPhaseDuration: Milliseconds): void {
        for (const [busId, bus] of this.busSystem.getAllBuses()) {
            const nextBusConfig = target.buses[busId];
            const previousBusConfig = this.current.buses[busId];
            const baseConfig = this.getBaseConfig(busId);

            const nextFilter = isDefined(nextBusConfig?.filter) ? nextBusConfig.filter : (baseConfig.filter ?? null);
            const previousFilter = isDefined(previousBusConfig?.filter)
                ? previousBusConfig.filter
                : (baseConfig.filter ?? null);

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

            const nextGain = isDefined(nextBusConfig?.gain) ? nextBusConfig.gain : (baseConfig.gain ?? 0);
            const previousGain = isDefined(previousBusConfig?.gain) ? previousBusConfig.gain : (baseConfig.gain ?? 0);

            if (nextGain !== previousGain) {
                bus.setLogicalGain(nextGain, remainingTime);
            }

            const nextSends = isDefined(nextBusConfig?.sends) ? nextBusConfig.sends : baseConfig.sends;
            const previousSends = isDefined(previousBusConfig?.sends) ? previousBusConfig.sends : baseConfig.sends;

            if (nextSends) {
                for (const [targetBusId, sendGain] of typedEntries(nextSends)) {
                    this.busSystem.applySend(busId, targetBusId, sendGain, remainingTime);
                }
            }

            if (previousSends) {
                for (const targetBusId of typedKeys(previousSends)) {
                    if (!nextSends || !isDefined(nextSends[targetBusId])) {
                        this.busSystem.applySend(busId, targetBusId, null, remainingTime);
                    }
                }
            }
        }
    }

    private completeTransition(target: DeepReadonly<MixerState>): void {
        this.current = target;
        this.state = { type: 'IDLE' };
        this.isInitialized = true;
    }
}
