/* eslint-disable unicorn/prefer-structured-clone */
// noinspection D

import { safeDisconnect } from '@webaudio-core';

import clamp from '../helpers/clamp';
import { evaluateRTPCCurve } from '../helpers/rtpcMath';
import { type IBus } from '../interfaces/IBuses';

import type { IAudioBus } from '../interfaces/IAudioBus';
import type { IPluginFactory } from '../interfaces/IAudioPlugins';
import type { IFilter } from '../interfaces/IFilter';
import type { IRTPCConfig, IRTPCManager, RTPCTargetProperty } from '../interfaces/IRTPCManager';
import type {
    AutomationEngine,
    AudioCtx,
    AudioNodeLike,
    BiquadFilterNodeLike,
    ConvolverNodeNodeLike,
    GainNodeLike,
    StereoPannerNodeLike
} from '@webaudio-core';

export default class AudioBus implements IAudioBus {
    inputGainNode: GainNodeLike;
    postFilterGain: GainNodeLike;
    readonly preFilterGain: GainNodeLike;
    public logicalTargetGain: number = 1;
    private readonly pannerNode: StereoPannerNodeLike | null = null;
    private readonly automation: AutomationEngine | null = null;
    private readonly id: string;
    private readonly context: AudioCtx;
    private config: IBus;
    private readonly defaultGain: number;
    private readonly routerMasterGain: GainNodeLike | null;
    private filterNode: BiquadFilterNodeLike | ConvolverNodeNodeLike | null = null;
    private readonly sendGains: Map<string, GainNodeLike> = new Map();
    private rtpcUnsubscribers: Array<() => void> = [];
    private readonly pluginFactory: IPluginFactory;
    private filterReplacePromise: Promise<void> | null = null;

    private isUpdateScheduled = false;
    private targetParams = {
        gain: { logical: 1, rtpc: 1, durationMs: 0 },
        filterFrequency: { logical: 20_000, rtpc: 0, durationMs: 0 },
        pan: { logical: 0, rtpc: 0, durationMs: 0 },
        sends: new Map<
            string,
            { logical: number | null; rtpc: number; durationMs: number; targetNode?: AudioNodeLike }
        >()
    };
    constructor({
        id,
        config = {},
        context,
        automation,
        routerMasterGain = null,
        pluginFactory
    }: {
        id: string;
        config: IBus;
        context: AudioCtx;
        automation: AutomationEngine;
        routerMasterGain: GainNodeLike | null;
        pluginFactory: IPluginFactory;
    }) {
        this.id = id;
        this.context = context;
        this.automation = automation;
        this.config =
            typeof structuredClone === 'function' ? structuredClone(config) : JSON.parse(JSON.stringify(config));
        this.defaultGain = config.gain ?? 1;
        this.routerMasterGain = routerMasterGain;
        this.pluginFactory = pluginFactory;

        //   inputGain → preFilterGain → (optional filterNode) → postFilterGain → (optional sendGainNode) → Master

        this.inputGainNode = context.createGain();
        this.inputGainNode.gain.value = this.defaultGain;
        this.automation.set(this.inputGainNode.gain, this.defaultGain);

        this.preFilterGain = context.createGain();
        this.automation.set(this.preFilterGain.gain, 1);

        this.postFilterGain = context.createGain();
        this.automation.set(this.postFilterGain.gain, 1);

        this.inputGainNode.connect(this.preFilterGain);
        this.preFilterGain.connect(this.postFilterGain);
        this.postFilterGain.connect(this.routerMasterGain!);

        this.targetParams.gain.logical = this.defaultGain;
        this.filterNode = null;

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.update(id, config);
    }

    getConfig(): IBus {
        return this.config;
    }

    public setLogicalGain(gain: number, durationMs: number = 0): void {
        this.targetParams.gain.logical = gain;
        this.targetParams.gain.durationMs = Math.max(this.targetParams.gain.durationMs, durationMs);
        this.scheduleUpdate();
    }

    public setRtpcGainModifier(modifier: number, durationMs: number = 0): void {
        this.targetParams.gain.rtpc = modifier;
        this.targetParams.gain.durationMs = Math.max(this.targetParams.gain.durationMs, durationMs);
        this.scheduleUpdate();
    }

    async update(id: string, config: IBus = {}): Promise<void> {
        this.config =
            typeof structuredClone === 'function' ? structuredClone(config) : JSON.parse(JSON.stringify(config));

        const needsFilter = !!config.filter;

        if (needsFilter) {
            if (this.filterNode) {
                const currentType =
                    'frequency' in this.filterNode ? (this.filterNode as BiquadFilterNodeLike).type : 'reverb';
                if (config.filter!.type && currentType !== config.filter!.type) {
                    await this.safeReplaceFilter(config.filter!);
                } else {
                    this.updateFilterParams(config.filter!);
                }
            } else {
                await this.safeReplaceFilter(config.filter!);
            }
        } else {
            if (this.filterNode) {
                await this.safeReplaceFilter(null, 8);
            }
        }

        if (config.gain !== undefined) {
            this.setLogicalGain(config.gain, 40);
        }
    }

    async safeReplaceFilter(
        newFilterConfigOrNode: BiquadFilterNodeLike | IFilter | null,
        durationMs: number = 8
    ): Promise<void> {
        while (this.filterReplacePromise) {
            await this.filterReplacePromise;
        }

        let resolveLock!: () => void;
        this.filterReplacePromise = new Promise(resolve => {
            resolveLock = resolve;
        });

        try {
            const fade = Math.max(1, durationMs);

            this.automation!.ramp(this.postFilterGain.gain, 0, fade, 'linear');

            await new Promise(r => setTimeout(r, durationMs + 2));

            this.disconnectFilter();
            safeDisconnect(this.preFilterGain);

            if (newFilterConfigOrNode) {
                this.filterNode = this.isFilterNode(newFilterConfigOrNode)
                    ? newFilterConfigOrNode
                    : this.createFilter(newFilterConfigOrNode);

                if (this.filterNode) {
                    this.connectFilter();
                } else {
                    this.preFilterGain.connect(this.postFilterGain);
                }

                if (this.isFilterNode(newFilterConfigOrNode)) {
                    const isBiquad = 'frequency' in this.filterNode!;
                    this.config.filter = isBiquad
                        ? {
                              type: (this.filterNode as BiquadFilterNodeLike).type,
                              frequency: (this.filterNode as BiquadFilterNodeLike).frequency?.value,
                              Q: (this.filterNode as BiquadFilterNodeLike).Q?.value
                          }
                        : { type: 'reverb' };
                } else {
                    this.config.filter = newFilterConfigOrNode;
                }
            } else {
                this.filterNode = null;
                this.preFilterGain.connect(this.postFilterGain);
                delete this.config.filter;
            }

            this.automation!.ramp(this.postFilterGain.gain, 1, fade, 'linear');
        } finally {
            this.filterReplacePromise = null;
            resolveLock();
        }
    }

    isFilterNode(
        newFilterConfigOrNode: BiquadFilterNodeLike | IFilter | null
    ): newFilterConfigOrNode is BiquadFilterNodeLike {
        return newFilterConfigOrNode !== null && typeof (newFilterConfigOrNode as any).connect === 'function';
    }

    updateFilterParams(config: IFilter | null): void {
        if (!this.filterNode || !config) return;

        if (!('frequency' in this.filterNode)) return;

        if (config.type === 'reverb') return;

        const biquadNode = this.filterNode as BiquadFilterNodeLike;

        if (config.frequency !== undefined && biquadNode.frequency) {
            this.targetParams.filterFrequency.logical = config.frequency;
            this.targetParams.filterFrequency.durationMs = 30;
            this.scheduleUpdate();
        }

        if (config.Q !== undefined && biquadNode.Q) {
            this.automation!.ramp(biquadNode.Q, config.Q, 30, 'linear');
        }
    }

    public updateSend({
        targetBusId,
        targetNode,
        targetGain,
        durationMs = 0
    }: {
        targetBusId: string;
        targetNode: AudioNodeLike;
        targetGain: number | null;
        durationMs: number;
    }): void {
        let state = this.targetParams.sends.get(targetBusId);
        if (!state) {
            state = { logical: targetGain, rtpc: 1, durationMs: 0, targetNode };
            this.targetParams.sends.set(targetBusId, state);
        }

        state.logical = targetGain;
        state.targetNode = targetNode;
        state.durationMs = Math.max(state.durationMs, durationMs);
        this.scheduleUpdate();
    }

    public bindRTPC(
        configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> | undefined,
        rtpcManager: IRTPCManager
    ): void {
        for (const unsub of this.rtpcUnsubscribers) unsub();
        this.rtpcUnsubscribers = [];

        if (!configs) return;

        for (const [targetName, config] of Object.entries(configs)) {
            if (!config) continue;

            const handler = (gameValue: number) => {
                const mappedValue = evaluateRTPCCurve(gameValue, config.curve);
                const target = targetName as RTPCTargetProperty;
                const smoothing = config.smoothingMs ?? 50;

                switch (target) {
                    case 'gain': {
                        this.setRtpcGainModifier(mappedValue, smoothing);
                        break;
                    }

                    case 'filterFrequency': {
                        this.targetParams.filterFrequency.rtpc = mappedValue;
                        this.targetParams.filterFrequency.durationMs = Math.max(
                            this.targetParams.filterFrequency.durationMs,
                            smoothing
                        );
                        this.scheduleUpdate();
                        break;
                    }

                    case 'pan': {
                        this.targetParams.pan.rtpc = mappedValue;
                        this.targetParams.pan.durationMs = Math.max(this.targetParams.pan.durationMs, smoothing);
                        this.scheduleUpdate();
                        break;
                    }

                    case 'pitch': {
                        break;
                    }

                    case 'sendLevel': {
                        const targetBusId = config.sendTargetBus;
                        if (!targetBusId) break;

                        let state = this.targetParams.sends.get(targetBusId);
                        if (!state) {
                            state = { logical: 0, rtpc: 1, durationMs: 0 };
                            this.targetParams.sends.set(targetBusId, state);
                        }
                        state.rtpc = mappedValue;
                        state.durationMs = Math.max(state.durationMs, smoothing);
                        this.scheduleUpdate();
                        break;
                    }

                    default: {
                        const exhaustiveCheck: never = target;
                        console.warn(`[AudioBus] Unhandled RTPC target: ${exhaustiveCheck}`);
                    }
                }
            };

            rtpcManager.events.on(config.gameParam, handler);
            this.rtpcUnsubscribers.push(() => rtpcManager.events.off(config.gameParam, handler));

            handler(rtpcManager.getValue(config.gameParam));
        }
    }

    private scheduleUpdate(): void {
        if (this.isUpdateScheduled) return;
        this.isUpdateScheduled = true;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve().then(() => this.recalculateAndApply());
    }

    private recalculateAndApply(): void {
        this.isUpdateScheduled = false;

        const finalGain = clamp(this.targetParams.gain.logical * this.targetParams.gain.rtpc, 0, 4); // Limit +12dB
        this.logicalTargetGain = finalGain;
        this.automation!.ramp(this.inputGainNode.gain, finalGain, this.targetParams.gain.durationMs, 'linear');
        this.targetParams.gain.durationMs = 0;

        if (this.filterNode && 'frequency' in this.filterNode) {
            const finalFreq = clamp(
                this.targetParams.filterFrequency.logical + this.targetParams.filterFrequency.rtpc,
                20,
                20_000
            );
            this.automation!.ramp(
                (this.filterNode as BiquadFilterNodeLike).frequency,
                finalFreq,
                this.targetParams.filterFrequency.durationMs,
                'exponential'
            );
            this.targetParams.filterFrequency.durationMs = 0;
        }

        if (this.pannerNode) {
            const finalPan = clamp(this.targetParams.pan.logical + this.targetParams.pan.rtpc, -1, 1);
            this.automation!.ramp(this.pannerNode.pan, finalPan, this.targetParams.pan.durationMs, 'linear');
            this.targetParams.pan.durationMs = 0;
        }

        for (const [targetBusId, state] of this.targetParams.sends.entries()) {
            const isRemoving = state.logical === null;
            let sendGainNode = this.sendGains.get(targetBusId);

            if (isRemoving) {
                if (sendGainNode) {
                    this.automation!.ramp(sendGainNode.gain, 0, state.durationMs, 'linear');
                    setTimeout(() => {
                        safeDisconnect(this.postFilterGain, sendGainNode);
                        if (state.targetNode) safeDisconnect(sendGainNode, state.targetNode);
                        this.sendGains.delete(targetBusId);
                    }, state.durationMs + 50);
                }
                this.targetParams.sends.delete(targetBusId);
            } else {
                const finalSendGain = clamp(state.logical! * state.rtpc, 0, 4);
                if (!sendGainNode && state.targetNode) {
                    sendGainNode = this.context.createGain();
                    sendGainNode.gain.value = 0;
                    this.automation!.set(sendGainNode.gain, 0);
                    this.postFilterGain.connect(sendGainNode);
                    sendGainNode.connect(state.targetNode);
                    this.sendGains.set(targetBusId, sendGainNode);
                }
                if (sendGainNode) {
                    this.automation!.ramp(sendGainNode.gain, finalSendGain, state.durationMs, 'linear');
                }
            }
            state.durationMs = 0;
        }
    }

    private createFilter(filterConfig: IFilter): BiquadFilterNodeLike | ConvolverNodeNodeLike | null {
        try {
            return this.pluginFactory.getFiltersPlugin().createNode(this.context, this.automation!, filterConfig);
        } catch (error) {
            console.warn(`[AudioBus] Failed to create filter for bus "${this.id}"`, error);
            return null;
        }
    }

    private connectFilter(): void {
        if (!this.filterNode) return;

        safeDisconnect(this.preFilterGain);

        try {
            this.preFilterGain.connect(this.filterNode);
            this.filterNode.connect(this.postFilterGain);
        } catch (error) {
            console.warn('[AudioBus] Failed to connect filterNode', error);
        }
    }

    private disconnectFilter(): void {
        if (!this.filterNode) return;

        safeDisconnect(this.preFilterGain, this.filterNode);
        safeDisconnect(this.filterNode, this.postFilterGain);
    }
}
