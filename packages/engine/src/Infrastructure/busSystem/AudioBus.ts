// oxlint-disable max-lines-per-function
// noinspection D

import type { IAudioBus } from '@domain/BusSystem/Ports/IAudioBus.js';
import type { IBus } from '@domain/BusSystem/Ports/IBuses.js';
import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
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
import type { BusId, Milliseconds, Seconds } from '@scene-grid/shared';

import { safeDisconnect } from '@infrastructure/utils/safeDisconnect.js';
import { evaluateRTPCCurve, isDefined, isAbsent, clamp, typedEntries, DeepReadonly } from '@scene-grid/shared';

type SendTargetState = {
    logical: number | null;
    rtpc: number;
    duration: Milliseconds;
    targetNode?: AudioNodeLike;
};

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
        executeAt: 0 as Seconds,
        duration: 0 as Milliseconds,
        newFilterConfigOrNode: null as BiquadFilterNodeLike | IFilter | null
    };

    private targetParams = {
        gain: { logical: 1, rtpc: 1, duration: 0 as Milliseconds },
        filterFrequency: { logical: 20_000, rtpc: 0, duration: 0 as Milliseconds },
        pan: { logical: 0, rtpc: 0, duration: 0 as Milliseconds },
        sends: new Map<BusId, SendTargetState>()
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
        this.logicalTargetGain = this.defaultGain;
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

    public processFrame(currentTime: Seconds): void {
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

    public setLogicalGain(gain: number, duration: Milliseconds = 0 as Milliseconds): void {
        this.targetParams.gain.logical = gain;
        this.logicalTargetGain = gain;

        if (duration <= 0) {
            this.automation.set(this.#inputGainNode.gain, gain);
            this.targetParams.gain.duration = 0 as Milliseconds;
        } else {
            this.targetParams.gain.duration = Math.max(this.targetParams.gain.duration, duration) as Milliseconds;
            this.scheduleUpdate();
        }
    }

    public setGainImmediate(gain: number): void {
        this.setLogicalGain(gain, 0 as Milliseconds);
    }

    public setRtpcGainModifier(modifier: number, duration: Milliseconds = 0 as Milliseconds): void {
        this.targetParams.gain.rtpc = modifier;
        this.targetParams.gain.duration = Math.max(this.targetParams.gain.duration, duration) as Milliseconds;
        this.scheduleUpdate();
    }

    public safeReplaceFilter(
        newFilterConfigOrNode: BiquadFilterNodeLike | IFilter | null,
        duration: Milliseconds = 8 as Milliseconds
    ): void {
        const fadeSec = Math.max(0.001, duration / 1000) as Seconds;

        this.automation.ramp(this.#postFilterGain.gain, 0, duration, 'linear');

        this.swapState.active = true;
        this.swapState.executeAt = (this.context.currentTime + fadeSec + 0.002) as Seconds;
        this.swapState.duration = duration;
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
            const smoothing = (config.smoothing ?? 50) as Milliseconds;
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
        duration
    }: {
        targetBusId: BusId;
        targetNode: AudioNodeLike;
        targetGain: number | null;
        duration: Milliseconds;
    }): void {
        let state = this.targetParams.sends.get(targetBusId);

        if (isAbsent(state)) {
            state = { logical: targetGain, rtpc: 1, duration: 0 as Milliseconds, targetNode };
            this.targetParams.sends.set(targetBusId, state);
        }

        state.logical = targetGain;
        state.targetNode = targetNode;
        state.duration = Math.max(state.duration, duration) as Milliseconds;
        this.scheduleUpdate();
    }

    public updateFilterParams(config: Partial<IFilter> | null): void {
        if (isAbsent(this.filterNode) || isAbsent(config)) return;

        if (!this.isBiquadFilterNode(this.filterNode)) return;
        if (config.type === 'reverb') return;

        if (isDefined(config.frequency) && isDefined(this.filterNode.frequency)) {
            this.targetParams.filterFrequency.logical = config.frequency;
            this.targetParams.filterFrequency.duration = 30 as Milliseconds;
            this.scheduleUpdate();
        }

        if ('Q' in config && isDefined(config.Q) && isDefined(this.filterNode.Q)) {
            this.automation.ramp(this.filterNode.Q, config.Q, 30 as Milliseconds, 'linear');
        }
    }

    public getTargetParamsGain(): DeepReadonly<{ logical: number; rtpc: number }> {
        return this.targetParams.gain;
    }

    public getLogicalTargetGain(): number {
        return this.logicalTargetGain;
    }

    private applyRTPCTarget(
        target: RTPCTargetProperty,
        mappedValue: number,
        smoothing: Milliseconds,
        targetBusId?: BusId
    ): void {
        switch (target) {
            case 'gain': {
                this.setRtpcGainModifier(mappedValue, smoothing);
                break;
            }
            case 'filterFrequency': {
                this.targetParams.filterFrequency.rtpc = mappedValue;
                this.targetParams.filterFrequency.duration = Math.max(
                    this.targetParams.filterFrequency.duration,
                    smoothing
                ) as Milliseconds;
                this.scheduleUpdate();
                break;
            }
            case 'pan': {
                this.targetParams.pan.rtpc = mappedValue;
                this.targetParams.pan.duration = Math.max(this.targetParams.pan.duration, smoothing) as Milliseconds;
                this.scheduleUpdate();
                break;
            }
            case 'sendLevel': {
                if (isAbsent(targetBusId)) break;
                let state = this.targetParams.sends.get(targetBusId);
                if (isAbsent(state)) {
                    state = { logical: 0, rtpc: 1, duration: 0 as Milliseconds };
                    this.targetParams.sends.set(targetBusId, state);
                }
                state.rtpc = mappedValue;
                state.duration = Math.max(state.duration, smoothing) as Milliseconds;
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
        this.applyGainTarget();
        this.applyFilterTarget();
        this.applyPanTarget();
        this.applySendsTargets();
    }

    private applyGainTarget(): void {
        const finalGain = clamp(this.targetParams.gain.logical * this.targetParams.gain.rtpc, 0, 4);
        this.logicalTargetGain = finalGain;
        this.automation.ramp(this.#inputGainNode.gain, finalGain, this.targetParams.gain.duration, 'linear');
        this.targetParams.gain.duration = 0 as Milliseconds;
    }

    private applyFilterTarget(): void {
        if (!this.isBiquadFilterNode(this.filterNode)) return;

        const finalFreq = clamp(
            this.targetParams.filterFrequency.logical + this.targetParams.filterFrequency.rtpc,
            20,
            20_000
        );
        this.automation.ramp(
            this.filterNode.frequency,
            finalFreq,
            this.targetParams.filterFrequency.duration,
            'exponential'
        );
        this.targetParams.filterFrequency.duration = 0 as Milliseconds;
    }

    private applyPanTarget(): void {
        if (isAbsent(this.pannerNode)) return;

        const finalPan = clamp(this.targetParams.pan.logical + this.targetParams.pan.rtpc, -1, 1);
        this.automation.ramp(this.pannerNode.pan, finalPan, this.targetParams.pan.duration, 'linear');
        this.targetParams.pan.duration = 0 as Milliseconds;
    }

    private applySendsTargets(): void {
        for (const [targetBusId, state] of this.targetParams.sends.entries()) {
            this.applySendTarget(targetBusId, state);
        }
    }

    private applySendTarget(targetBusId: BusId, state: SendTargetState): void {
        const isRemoving = state.logical === null;
        const sendGainNode = this.sendGains.get(targetBusId);

        if (isRemoving) {
            this.removeSendTarget(targetBusId, state, sendGainNode);
        } else {
            this.updateSendTarget(targetBusId, state, sendGainNode);
        }
        state.duration = 0 as Milliseconds;
    }

    private removeSendTarget(targetBusId: BusId, state: SendTargetState, sendGainNode?: GainNodeLike): void {
        if (isAbsent(sendGainNode)) {
            this.targetParams.sends.delete(targetBusId);
            return;
        }

        this.automation.ramp(sendGainNode.gain, 0, state.duration, 'linear');

        setTimeout(() => {
            const currentState = this.targetParams.sends.get(targetBusId);
            if (isDefined(currentState) && currentState.logical !== null) {
                return;
            }

            safeDisconnect(this.#postFilterGain, sendGainNode);
            if (isDefined(state.targetNode)) safeDisconnect(sendGainNode, state.targetNode);
            this.sendGains.delete(targetBusId);

            this.targetParams.sends.delete(targetBusId);
        }, state.duration + 50);
    }

    private updateSendTarget(targetBusId: BusId, state: SendTargetState, existingNode?: GainNodeLike): void {
        const finalSendGain = clamp((state.logical ?? 0) * state.rtpc, 0, 4);
        let sendGainNode = existingNode;

        if (isAbsent(sendGainNode) && isDefined(state.targetNode)) {
            sendGainNode = this.context.createGain();
            sendGainNode.gain.value = 0;
            this.automation.set(sendGainNode.gain, 0);
            this.#postFilterGain.connect(sendGainNode);
            sendGainNode.connect(state.targetNode);
            this.sendGains.set(targetBusId, sendGainNode);
        }

        if (isDefined(sendGainNode)) {
            this.automation.ramp(sendGainNode.gain, finalSendGain, state.duration, 'linear');
        }
    }

    private executePhysicalFilterSwap(): void {
        this.disconnectFilter();
        safeDisconnect(this.#preFilterGain);

        const newFilter = this.swapState.newFilterConfigOrNode;
        this.applyNewFilter(newFilter);

        this.automation.ramp(this.#postFilterGain.gain, 1, this.swapState.duration, 'linear');

        this.swapState.active = false;
        this.swapState.newFilterConfigOrNode = null;
    }

    private applyNewFilter(newFilter: BiquadFilterNodeLike | IFilter | null): void {
        if (isAbsent(newFilter)) {
            this.clearFilterNode();
            return;
        }

        this.filterNode = this.isAudioNode(newFilter) ? newFilter : this.createFilter(newFilter);

        if (isAbsent(this.filterNode)) {
            this.clearFilterNode();
            return;
        }

        this.connectFilter();

        if (!this.isAudioNode(newFilter)) {
            this.currentFilterConfig = newFilter;
            return;
        }

        this.currentFilterConfig = this.isBiquadFilterNode(this.filterNode)
            ? {
                  type: this.filterNode.type,
                  frequency: this.filterNode.frequency?.value,
                  Q: this.filterNode.Q?.value
              }
            : { type: 'reverb' };
    }

    private clearFilterNode(): void {
        this.filterNode = null;
        this.#preFilterGain.connect(this.#postFilterGain);
        this.currentFilterConfig = undefined;
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
        return this.pluginFactory.getFiltersPlugin().createNode(this.context, this.automation, filterConfig);
    }

    private connectFilter(): void {
        if (isAbsent(this.filterNode)) return;
        safeDisconnect(this.#preFilterGain);
        this.#preFilterGain.connect(this.filterNode);
        this.filterNode.connect(this.#postFilterGain);
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
