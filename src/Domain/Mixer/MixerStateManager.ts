// noinspection D
// noinspection D

import mitt from 'mitt';

import { isFilterEqual } from '@domain/BusSystem/ValueObjects/filterEquals.js';
import { isAbsent, isDefined } from '@shared/guards.js';

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { MixerState } from '@domain/Mixer/Ports/IMixerStateManager.js';
import type { BusId } from '@domain/Types/Branded.js';
import type { Emitter } from 'mitt';

enum MixerFSMState {
    IDLE = 'idle',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    FADE_OUT_FILTERS = 'fade_out_filters',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    RUNNING_TRANSITION = 'running_transition'
}

export default class MixerStateManager {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static TICK_RATE_MS = 16;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public readonly events: Emitter<{ 'transition:start': { durationMs: number } }> = mitt();
    private current: MixerState = { buses: {} };
    private target: MixerState | null = null;
    private fsm: MixerFSMState = MixerFSMState.IDLE;
    private isInitialized = false;
    private elapsed = 0;
    private totalDuration = 0;
    private filterPhaseDuration = 0;
    private isCurrentTransitionInterruptible = true;

    constructor(
        private readonly busSystem: IAudioBusSystem,
        private readonly rtpcAdapter: IRTPCAdapter
    ) {}

    public getState(): MixerState {
        return structuredClone(this.current);
    }

    public applyState(next: MixerState, { durationMs = 500, interruptible = true } = {}): void {
        if (this.fsm !== MixerFSMState.IDLE && !this.isCurrentTransitionInterruptible) {
            return;
        }

        for (const [busId, nextBusConfig] of Object.entries(next.buses)) {
            const bus = this.busSystem.getBus(busId as BusId);
            if (bus) {
                bus.logicalTargetGain = nextBusConfig.gain ?? 0;
            }
        }

        this.events.emit('transition:start', { durationMs });

        this.target = next;
        this.totalDuration = durationMs;
        this.filterPhaseDuration = durationMs * 0.25;
        this.elapsed = 0;
        this.isCurrentTransitionInterruptible = interruptible;

        this.startFilterPhase();

        if (!this.isInitialized || durationMs <= 0) {
            this.forceInstantTransition();
            return;
        }

        this.fsm = MixerFSMState.FADE_OUT_FILTERS;
    }

    public cancelActiveTransition(): void {
        if (this.fsm === MixerFSMState.IDLE) return;

        this.target = null;
        this.fsm = MixerFSMState.IDLE;
        this.elapsed = 0;
        this.isCurrentTransitionInterruptible = true;
    }

    public update(dt: number): void {
        if (this.fsm === MixerFSMState.IDLE || !this.target) return;

        this.elapsed += dt;

        if (this.fsm === MixerFSMState.FADE_OUT_FILTERS && this.elapsed >= this.filterPhaseDuration) {
            this.startMainTransitionPhase();
            this.fsm = MixerFSMState.RUNNING_TRANSITION;
        }

        if (this.elapsed >= this.totalDuration) {
            this.completeTransition();
        }
    }

    private forceInstantTransition(): void {
        for (const [busId, bus] of this.busSystem.getAllBuses()) {
            const busConfig = this.target?.buses[busId];
            const targetGain = busConfig ? (busConfig.gain ?? 0) : 0;
            bus.setGainImmediate(targetGain);
            const targetFilter = busConfig?.filter ?? null;
            bus.safeReplaceFilter(targetFilter, 0);
        }

        this.current = this.target!;
        this.target = null;
        this.fsm = MixerFSMState.IDLE;
        this.isInitialized = true;
    }

    private startFilterPhase(): void {
        if (!this.target) return;

        for (const [busId, nextBus] of Object.entries(this.target.buses)) {
            const bus = this.busSystem.getBus(busId as BusId);
            const previousBus = this.current.buses[busId];

            if (isAbsent(bus)) continue;

            if (!isFilterEqual(previousBus?.filter, nextBus.filter)) {
                bus.safeReplaceFilter(nextBus.filter ?? null, this.filterPhaseDuration);
            }

            if (isDefined(nextBus.rtpc)) {
                bus.bindRTPC(nextBus.rtpc, this.rtpcAdapter);
            }
        }
    }

    private startMainTransitionPhase(): void {
        if (!this.target) return;

        const remainingTime = Math.max(0, this.totalDuration - this.elapsed);

        for (const [busId, bus] of this.busSystem.getAllBuses()) {
            const nextBusConfig = this.target.buses[busId];
            const previousBusConfig = this.current.buses[busId];

            const nextGain = isDefined(nextBusConfig?.gain) ? nextBusConfig!.gain : 0;

            const shouldForce = !this.isInitialized;
            const previousGain = previousBusConfig?.gain;

            if (shouldForce || nextGain !== previousGain) {
                bus.setLogicalGain(nextGain, remainingTime);
            }

            if (isDefined(nextBusConfig?.sends)) {
                for (const [targetBusId, sendGain] of Object.entries(nextBusConfig!.sends!)) {
                    this.busSystem.applySend(busId as BusId, targetBusId as BusId, sendGain, remainingTime);
                }
            } else if (isDefined(previousBusConfig?.sends)) {
                for (const targetBusId of Object.keys(previousBusConfig.sends)) {
                    this.busSystem.applySend(busId as BusId, targetBusId as BusId, null, remainingTime);
                }
            }
        }
    }

    private completeTransition(): void {
        this.current = this.target!;
        this.target = null;
        this.fsm = MixerFSMState.IDLE;
        this.elapsed = 0;
        this.isCurrentTransitionInterruptible = true;
        this.isInitialized = true;
    }
}
