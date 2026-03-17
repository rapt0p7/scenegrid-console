// noinspection D

import type AudioBusSystem from '../BusSystem/AudioBusSystem';
import type { BusId } from '../interfaces/IAudioBusSystem';
import type { MixerState } from '../interfaces/IMixerStateManager';
import type { IRTPCManager } from '../interfaces/IRTPCManager';
import type { AutomationEngine } from '@webaudio-core';

enum MixerFSMState {
    IDLE = 'idle',
    TRANSITION = 'transition'
}

export default class MixerStateManager {
    private current: MixerState = { buses: {} };
    private history: MixerState = { buses: {} };
    private fsm: MixerFSMState = MixerFSMState.IDLE;

    private activeTransition: {
        id: number;
        interruptible: boolean;
    } | null = null;

    private transitionCounter = 0;

    constructor(
        private readonly busSystem: AudioBusSystem,
        private readonly automation: AutomationEngine,
        private readonly rtpcManager: IRTPCManager
    ) {}

    getState(): MixerState {
        return structuredClone(this.current);
    }

    async applyState(
        next: MixerState,
        {
            durationMs = 500,
            interruptible = true
        }: {
            durationMs?: number;
            interruptible?: boolean;
        } = {}
    ): Promise<void> {
        if (this.fsm === MixerFSMState.TRANSITION) {
            if (!this.activeTransition?.interruptible) {
                return;
            }

            this.cancelActiveTransition();
        }

        const id = ++this.transitionCounter;

        this.fsm = MixerFSMState.TRANSITION;
        this.activeTransition = { id, interruptible };

        const from = this.current;
        const to = next;

        try {
            await this.runTransition(id, from, to, durationMs);
            if (this.activeTransition?.id === id) {
                this.history = structuredClone(from);
                this.current = to;
            }
        } finally {
            if (this.activeTransition?.id === id) {
                this.activeTransition = null;
                this.fsm = MixerFSMState.IDLE;
            }
        }
    }

    private cancelActiveTransition(): void {
        this.activeTransition = null;
        this.fsm = MixerFSMState.IDLE;
    }

    private async runTransition(id: number, from: MixerState, to: MixerState, durationMs: number): Promise<void> {
        const tasks: Array<Promise<any>> = [];

        for (const busId of Object.keys(to.buses)) {
            if (this.activeTransition?.id !== id) return;

            const previous = from.buses[busId] ?? {};
            const next = to.buses[busId];

            const bus = this.busSystem.getBus(busId as BusId);
            if (!bus) continue;

            if (this.activeTransition?.id !== id) return;

            if (next.gain !== undefined && next.gain !== previous.gain) {
                bus.logicalTargetGain = next.gain;
                this.automation.ramp(bus.inputGainNode.gain, next.gain, durationMs);
            }

            if (JSON.stringify(previous.filter) !== JSON.stringify(next.filter)) {
                tasks.push(bus.safeReplaceFilter(next.filter ?? null, durationMs * 0.25));
            }

            if (next.sends) {
                for (const [targetBusId, sendGain] of Object.entries(next.sends)) {
                    this.busSystem.applySend(busId as BusId, targetBusId as BusId, sendGain, durationMs);
                }
            }

            if (next.rtpc !== undefined) {
                bus.bindRTPC(next.rtpc, this.rtpcManager);
            }
        }

        await Promise.all(tasks);
    }
}
