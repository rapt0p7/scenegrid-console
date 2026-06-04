// oxlint-disable max-lines-per-function
// noinspection D

import { safeDisconnect } from '@infrastructure/utils/safeDisconnect.js';
import { evaluateRTPCCurve, isDefined, isAbsent, clamp, typedEntries } from '@scene-grid/shared';

import type { IAudioBus } from '@domain/BusSystem/Ports/IAudioBus.js';
import type { IBus } from '@domain/BusSystem/Ports/IBuses.js';
import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { BusId } from '@scene-grid/shared';
import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type {
    AudioCtx,
    AudioNodeLike,
    BiquadFilterNodeLike,
    ConvolverNodeNodeLike,
    GainNodeLike,
    StereoPannerNodeLike
} from '@infrastructure/types/IAudioContext.js';
import type { IPluginFactory } from '@infrastructure/types/IAudioPlugins.js';

export default class AudioBus implements IAudioBus {
    public logicalTargetGain: number = 1;

    public get inputNode(): GainNodeLike {
        return this.#inputGainNode;
    }

    public get duckerTapNode(): GainNodeLike {
        return this.#preFilterGain;
    }

    public get analyzerTapNode(): GainNodeLike {
        return this.#postFilterGain;
    }

    readonly #inputGainNode: GainNodeLike;
    readonly #preFilterGain: GainNodeLike;
    readonly #postFilterGain: GainNodeLike;

    private readonly pannerNode: StereoPannerNodeLike | null = null;
    private readonly automation: AutomationEngine;
    private readonly id: BusId;
    private readonly context: AudioCtx;
    private readonly config: Readonly<IBus>;
    private readonly defaultGain: number;
    private readonly routerMasterGain: GainNodeLike | null;
    private filterNode: BiquadFilterNodeLike | ConvolverNodeNodeLike | null = null;
    private currentFilterConfig?: IFilter;
    private readonly sendGains: Map<BusId, GainNodeLike> = new Map();
    private readonly pluginFactory: IPluginFactory;
    private activeRTPCConfigs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> | null = null;
    private isDirty = false;
    private swapState = {
        active: false,
        executeAt: 0,
        durationMs: 0,
        newFilterConfigOrNode: null as BiquadFilterNodeLike | IFilter | null
    };

    private targetParams = {
        gain: { logical: 1, rtpc: 1, durationMs: 0 },
        filterFrequency: { logical: 20_000, rtpc: 0, durationMs: 0 },
        pan: { logical: 0, rtpc: 0, durationMs: 0 },
        sends: new Map<
            BusId,
            { logical: number | null; rtpc: number; durationMs: number; targetNode?: AudioNodeLike }
        >()
    };

    constructor({
        id,
        config,
        context,
        automation,
        routerMasterGain,
        pluginFactory
    }: {
        id: BusId;
        config: IBus;
        context: AudioCtx;
        automation: AutomationEngine;
        routerMasterGain: GainNodeLike | null;
        pluginFactory: IPluginFactory;
    }) {
        this.id = id;
        this.context = context;
        this.automation = automation;
        this.config = structuredClone(config);
        this.currentFilterConfig = this.config.filter;
        this.defaultGain = config.gain ?? 1;
        this.routerMasterGain = routerMasterGain;
        this.pluginFactory = pluginFactory;

        this.#inputGainNode = context.createGain();
        this.#inputGainNode.gain.value = this.defaultGain;
        this.automation.set(this.#inputGainNode.gain, this.defaultGain);

        this.#preFilterGain = context.createGain();
        this.automation.set(this.#preFilterGain.gain, 1);

        this.#postFilterGain = context.createGain();
        this.automation.set(this.#postFilterGain.gain, 1);

        this.#inputGainNode.connect(this.#preFilterGain);
        this.#preFilterGain.connect(this.#postFilterGain);

        if (isDefined(this.routerMasterGain)) {
            this.#postFilterGain.connect(this.routerMasterGain);
        }

        this.targetParams.gain.logical = this.defaultGain;
        this.filterNode = null;

        this.coldStart();
    }

    public processFrame(currentTime: number): void {
        if (this.isDirty) {
            this.recalculateAndApply();
            this.isDirty = false;
        }

        if (this.swapState.active && currentTime >= this.swapState.executeAt) {
            this.executePhysicalFilterSwap();
        }
    }

    public getConfig(): IBus {
        const result: Record<string, any> = { ...this.config };

        if (isDefined(this.currentFilterConfig)) {
            result.filter = this.currentFilterConfig;
        } else {
            delete result.filter;
        }

        return result as IBus;
    }

    public setLogicalGain(gain: number, durationMs: number = 0): void {
        this.targetParams.gain.logical = gain;
        this.logicalTargetGain = gain;

        if (durationMs <= 0) {
            this.automation.set(this.#inputGainNode.gain, gain);
            this.targetParams.gain.durationMs = 0;
        } else {
            this.targetParams.gain.durationMs = Math.max(this.targetParams.gain.durationMs, durationMs);
            this.scheduleUpdate();
        }
    }

    public setGainImmediate(gain: number): void {
        this.setLogicalGain(gain, 0);
    }

    public setRtpcGainModifier(modifier: number, durationMs: number = 0): void {
        this.targetParams.gain.rtpc = modifier;
        this.targetParams.gain.durationMs = Math.max(this.targetParams.gain.durationMs, durationMs);
        this.scheduleUpdate();
    }

    public safeReplaceFilter(
        newFilterConfigOrNode: BiquadFilterNodeLike | IFilter | null,
        durationMs: number = 8
    ): void {
        const fadeSec = Math.max(0.001, durationMs / 1000);

        this.automation.ramp(this.#postFilterGain.gain, 0, durationMs, 'linear');

        this.swapState.active = true;
        this.swapState.executeAt = this.context.currentTime + fadeSec + 0.002;
        this.swapState.durationMs = durationMs;
        this.swapState.newFilterConfigOrNode = newFilterConfigOrNode;
    }

    public bindRTPC(configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> | undefined): void {
        this.activeRTPCConfigs = configs ?? null;
    }

    public tickRTPC(rtpcAdapter: IRTPCAdapter): void {
        if (isAbsent(this.activeRTPCConfigs)) return;

        for (const [targetName, config] of typedEntries(this.activeRTPCConfigs)) {
            if (isAbsent(config)) continue;

            const target = targetName;
            const smoothing = config.smoothingMs ?? 50;
            const targetBusId = config.sendTargetBus;

            const gameValue = rtpcAdapter.getValue(config.gameParam);
            const mappedValue = evaluateRTPCCurve(gameValue, config.curve);

            this.applyRTPCTarget(target, mappedValue, smoothing, targetBusId);
        }
    }

    public updateSend({
        targetBusId,
        targetNode,
        targetGain,
        durationMs
    }: {
        targetBusId: BusId;
        targetNode: AudioNodeLike;
        targetGain: number | null;
        durationMs: number;
    }): void {
        let state = this.targetParams.sends.get(targetBusId);

        if (isAbsent(state)) {
            state = { logical: targetGain, rtpc: 1, durationMs: 0, targetNode };
            this.targetParams.sends.set(targetBusId, state);
        }

        state.logical = targetGain;
        state.targetNode = targetNode;
        state.durationMs = Math.max(state.durationMs, durationMs);
        this.scheduleUpdate();
    }

    public updateFilterParams(config: IFilter | null): void {
        if (isAbsent(this.filterNode) || isAbsent(config)) return;

        if (!this.isBiquadFilterNode(this.filterNode)) return;
        if (config.type === 'reverb') return;

        if (isDefined(config.frequency) && isDefined(this.filterNode.frequency)) {
            this.targetParams.filterFrequency.logical = config.frequency;
            this.targetParams.filterFrequency.durationMs = 30;
            this.scheduleUpdate();
        }

        if (isDefined(config.Q) && isDefined(this.filterNode.Q)) {
            this.automation.ramp(this.filterNode.Q, config.Q, 30, 'linear');
        }
    }

    private applyRTPCTarget(
        target: RTPCTargetProperty,
        mappedValue: number,
        smoothing: number,
        targetBusId?: BusId
    ): void {
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
            case 'sendLevel': {
                if (isAbsent(targetBusId)) break;
                let state = this.targetParams.sends.get(targetBusId);
                if (isAbsent(state)) {
                    state = { logical: 0, rtpc: 1, durationMs: 0 };
                    this.targetParams.sends.set(targetBusId, state);
                }
                state.rtpc = mappedValue;
                state.durationMs = Math.max(state.durationMs, smoothing);
                this.scheduleUpdate();
                break;
            }
            case 'pitch': {
                break;
            }
            default: {
                const exhaustiveCheck: never = target;
                // oxlint-disable-next-line typescript/restrict-template-expressions
                console.warn(`[AudioBus] Unhandled RTPC target: ${exhaustiveCheck}`);
            }
        }
    }

    private scheduleUpdate(): void {
        this.isDirty = true;
    }

    private recalculateAndApply(): void {
        const finalGain = clamp(this.targetParams.gain.logical * this.targetParams.gain.rtpc, 0, 4);
        this.logicalTargetGain = finalGain;
        this.automation.ramp(this.#inputGainNode.gain, finalGain, this.targetParams.gain.durationMs, 'linear');
        this.targetParams.gain.durationMs = 0;

        if (this.isBiquadFilterNode(this.filterNode)) {
            const finalFreq = clamp(
                this.targetParams.filterFrequency.logical + this.targetParams.filterFrequency.rtpc,
                20,
                20_000
            );
            this.automation.ramp(
                this.filterNode.frequency,
                finalFreq,
                this.targetParams.filterFrequency.durationMs,
                'exponential'
            );
            this.targetParams.filterFrequency.durationMs = 0;
        }

        if (isDefined(this.pannerNode)) {
            const finalPan = clamp(this.targetParams.pan.logical + this.targetParams.pan.rtpc, -1, 1);
            this.automation.ramp(this.pannerNode.pan, finalPan, this.targetParams.pan.durationMs, 'linear');
            this.targetParams.pan.durationMs = 0;
        }

        for (const [targetBusId, state] of this.targetParams.sends.entries()) {
            const logicalValue = state.logical;
            const isRemoving = logicalValue === null;

            let sendGainNode = this.sendGains.get(targetBusId);

            if (isRemoving) {
                if (isDefined(sendGainNode)) {
                    this.automation.ramp(sendGainNode.gain, 0, state.durationMs, 'linear');

                    setTimeout(() => {
                        const currentState = this.targetParams.sends.get(targetBusId);
                        if (isDefined(currentState) && currentState.logical !== null) {
                            return;
                        }

                        safeDisconnect(this.#postFilterGain, sendGainNode);
                        if (isDefined(state.targetNode)) safeDisconnect(sendGainNode, state.targetNode);
                        this.sendGains.delete(targetBusId);

                        this.targetParams.sends.delete(targetBusId);
                    }, state.durationMs + 50);
                } else {
                    this.targetParams.sends.delete(targetBusId);
                }
            } else {
                const finalSendGain = clamp(logicalValue * state.rtpc, 0, 4);

                if (isAbsent(sendGainNode) && isDefined(state.targetNode)) {
                    sendGainNode = this.context.createGain();
                    sendGainNode.gain.value = 0;
                    this.automation.set(sendGainNode.gain, 0);
                    this.#postFilterGain.connect(sendGainNode);
                    sendGainNode.connect(state.targetNode);
                    this.sendGains.set(targetBusId, sendGainNode);
                }
                if (isDefined(sendGainNode)) {
                    this.automation.ramp(sendGainNode.gain, finalSendGain, state.durationMs, 'linear');
                }
            }
            state.durationMs = 0;
        }
    }

    private executePhysicalFilterSwap(): void {
        this.disconnectFilter();
        safeDisconnect(this.#preFilterGain);

        const newFilter = this.swapState.newFilterConfigOrNode;

        if (isDefined(newFilter)) {
            this.filterNode = this.isAudioNode(newFilter) ? newFilter : this.createFilter(newFilter);

            if (isDefined(this.filterNode)) {
                this.connectFilter();

                if (this.isAudioNode(newFilter)) {
                    this.currentFilterConfig = this.isBiquadFilterNode(this.filterNode)
                        ? {
                              type: this.filterNode.type,
                              frequency: this.filterNode.frequency?.value,
                              Q: this.filterNode.Q?.value
                          }
                        : { type: 'reverb' };
                } else {
                    this.currentFilterConfig = newFilter;
                }
            } else {
                this.#preFilterGain.connect(this.#postFilterGain);
                this.currentFilterConfig = undefined;
            }
        } else {
            this.filterNode = null;
            this.#preFilterGain.connect(this.#postFilterGain);
            this.currentFilterConfig = undefined;
        }

        this.automation.ramp(this.#postFilterGain.gain, 1, this.swapState.durationMs, 'linear');

        this.swapState.active = false;
        this.swapState.newFilterConfigOrNode = null;
    }

    private coldStart(): void {
        this.targetParams.gain.logical = this.defaultGain;

        if (isDefined(this.config.filter)) {
            this.filterNode = this.createFilter(this.config.filter);

            if (isDefined(this.filterNode)) {
                this.#preFilterGain.connect(this.filterNode);
                this.filterNode.connect(this.#postFilterGain);

                if (this.isBiquadFilterNode(this.filterNode)) {
                    this.currentFilterConfig = {
                        type: this.filterNode.type,
                        frequency: this.filterNode.frequency?.value,
                        Q: this.filterNode.Q?.value
                    };
                }
            } else {
                this.#preFilterGain.connect(this.#postFilterGain);
                this.currentFilterConfig = undefined;
            }
        } else {
            this.filterNode = null;
            this.#preFilterGain.connect(this.#postFilterGain);
            this.currentFilterConfig = undefined;
        }
    }

    private createFilter(filterConfig: IFilter): BiquadFilterNodeLike | ConvolverNodeNodeLike | null {
        try {
            return this.pluginFactory.getFiltersPlugin().createNode(this.context, this.automation, filterConfig);
        } catch (error) {
            console.warn(`[AudioBus] Failed to create filter for bus "${this.id}"`, error);
            return null;
        }
    }

    private connectFilter(): void {
        if (isAbsent(this.filterNode)) return;
        safeDisconnect(this.#preFilterGain);
        try {
            this.#preFilterGain.connect(this.filterNode);
            this.filterNode.connect(this.#postFilterGain);
        } catch (error) {
            console.warn('[AudioBus] Failed to connect filterNode', error);
        }
    }

    private disconnectFilter(): void {
        if (isAbsent(this.filterNode)) return;
        safeDisconnect(this.#preFilterGain, this.filterNode);
        safeDisconnect(this.filterNode, this.#postFilterGain);
    }

    private isAudioNode(configOrNode: BiquadFilterNodeLike | IFilter): configOrNode is BiquadFilterNodeLike {
        return typeof (configOrNode as any).connect === 'function';
    }

    private isBiquadFilterNode(node: AudioNodeLike | null): node is BiquadFilterNodeLike {
        return isDefined(node) && 'frequency' in node;
    }
}
