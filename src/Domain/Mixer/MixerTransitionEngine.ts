// noinspection D

import mitt from 'mitt';

import { isFilterEqual } from '@domain/BusSystem/ValueObjects/filterEquals.js';
import { isAbsent, isDefined } from '@shared/guards.js';

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import { ITransitionOptions, MixerState } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';
import type { BusId } from '@shared/Types/Branded.js';
import type { Emitter } from 'mitt';
import { DeepReadonly } from '@shared/DeepReadonly.js';

type MixerFSMState =
    | { type: 'IDLE' }
    | {
          type: 'FADE_OUT_FILTERS' | 'RUNNING_TRANSITION';
          target: MixerState;
          elapsed: number;
          totalDuration: number;
          filterPhaseDuration: number;
          isInterruptible: boolean;
      };

export default class MixerTransitionEngine {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static TICK_RATE_MS = 16;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public readonly events: Emitter<{ 'transition:start': { durationMs: number } }> = mitt();

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
        { durationMs = 500, interruptible = true }: DeepReadonly<ITransitionOptions> = {}
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

        this.events.emit('transition:start', { durationMs });

        if (!this.isInitialized || durationMs <= 0) {
            this.forceInstantTransition(next);
            return;
        }

        const filterPhaseDuration = durationMs * 0.25;

        this.state = {
            type: 'FADE_OUT_FILTERS',
            target: next,
            elapsed: 0,
            totalDuration: durationMs,
            filterPhaseDuration,
            isInterruptible: interruptible
        };

        this.startFilterPhase(next, filterPhaseDuration);
    }

    public cancelActiveTransition(): void {
        if (this.state.type === 'IDLE') return;
        this.state = { type: 'IDLE' };
    }

    public tick(currentTime: number, dt: number): void {
        if (this.state.type === 'IDLE') return;

        const s = this.state;
        s.elapsed += dt;

        if (s.type === 'FADE_OUT_FILTERS' && s.elapsed >= s.filterPhaseDuration) {
            const remainingTime = Math.max(0, s.totalDuration - s.elapsed);
            this.startMainTransitionPhase(s.target, remainingTime);
            s.type = 'RUNNING_TRANSITION';
        }

        if (s.elapsed >= s.totalDuration) {
            this.completeTransition(s.target);
        }
    }

    private forceInstantTransition(target: DeepReadonly<MixerState>): void {
        for (const [busId, bus] of this.busSystem.getAllBuses()) {
            const busConfig = target.buses[busId];
            const targetGain = busConfig ? (busConfig.gain ?? 0) : 0;
            bus.setGainImmediate(targetGain);
            const targetFilter = busConfig?.filter ?? null;
            bus.safeReplaceFilter(targetFilter, 0);
        }

        this.current = target;
        this.state = { type: 'IDLE' };
        this.isInitialized = true;
    }

    private startFilterPhase(target: DeepReadonly<MixerState>, filterPhaseDuration: number): void {
        for (const [busId, nextBus] of Object.entries(target.buses)) {
            const bus = this.busSystem.getBus(busId as BusId);
            const previousBus = this.current.buses[busId as BusId];

            if (isAbsent(bus)) continue;

            if (!isFilterEqual(previousBus?.filter, nextBus.filter)) {
                bus.safeReplaceFilter(nextBus.filter ?? null, filterPhaseDuration);
            }

            if (isDefined(nextBus.rtpc)) {
                bus.bindRTPC(nextBus.rtpc, this.rtpcAdapter);
            }
        }
    }

    private startMainTransitionPhase(target: DeepReadonly<MixerState>, remainingTime: number): void {
        for (const [busId, bus] of this.busSystem.getAllBuses()) {
            const nextBusConfig = target.buses[busId];
            const previousBusConfig = this.current.buses[busId];

            const nextGain = isDefined(nextBusConfig?.gain) ? nextBusConfig.gain : this.busSystem.getDefaultGain(busId);
            const previousGain = previousBusConfig?.gain;

            if (nextGain !== previousGain) {
                bus.setLogicalGain(nextGain, remainingTime);
            }

            if (isDefined(nextBusConfig?.sends)) {
                for (const [targetBusId, sendGain] of Object.entries(nextBusConfig.sends)) {
                    this.busSystem.applySend(busId, targetBusId as BusId, sendGain, remainingTime);
                }
            } else if (isDefined(previousBusConfig?.sends)) {
                for (const targetBusId of Object.keys(previousBusConfig.sends)) {
                    this.busSystem.applySend(busId, targetBusId as BusId, null, remainingTime);
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
