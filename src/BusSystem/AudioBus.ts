// noinspection D

import { safeDisconnect } from '@webaudio-core';

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

        const master = this.routerMasterGain!;
        this.postFilterGain.connect(master);

        this.filterNode = null;

        this.update(id, config);
    }

    getConfig(): IBus {
        return this.config;
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
            this.automation!.ramp(this.inputGainNode.gain, config.gain, 40, 'linear');
        }
    }

    public updateSend(
        targetBusId: string,
        targetNode: AudioNodeLike,
        targetGain: number | null,
        durationMs: number = 0
    ): void {
        let sendGainNode = this.sendGains.get(targetBusId);

        if (targetGain === null) {
            if (sendGainNode) {
                this.automation!.ramp(sendGainNode.gain, 0, durationMs, 'linear');

                setTimeout(() => {
                    safeDisconnect(this.postFilterGain, sendGainNode);
                    safeDisconnect(sendGainNode, targetNode);
                    this.sendGains.delete(targetBusId);
                }, durationMs + 50);
            }
            return;
        }

        if (!sendGainNode) {
            sendGainNode = this.context.createGain();
            sendGainNode.gain.value = 0;
            this.automation!.set(sendGainNode.gain, 0);

            this.postFilterGain.connect(sendGainNode);
            sendGainNode.connect(targetNode);

            this.sendGains.set(targetBusId, sendGainNode);
        }

        this.automation!.ramp(sendGainNode.gain, targetGain, durationMs, 'linear');
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
                        this.logicalTargetGain = mappedValue;
                        this.automation!.ramp(this.inputGainNode.gain, mappedValue, smoothing, 'exponential');
                        break;
                    }

                    case 'filterFrequency': {
                        if (this.filterNode && 'frequency' in this.filterNode) {
                            this.automation!.ramp(this.filterNode.frequency, mappedValue, smoothing, 'exponential');
                        }
                        break;
                    }

                    case 'pan': {
                        if (this.pannerNode) {
                            this.automation!.ramp(this.pannerNode.pan, mappedValue, smoothing, 'linear');
                        }
                        break;
                    }

                    case 'pitch': {
                        break;
                    }

                    case 'sendLevel': {
                        const targetBusId = config.sendTargetBus;
                        if (!targetBusId) {
                            console.warn(`[AudioBus] RTPC sendLevel requires a 'sendTargetBus' property in config.`);
                            break;
                        }

                        const sendGainNode = this.sendGains.get(targetBusId);

                        if (sendGainNode) {
                            this.automation!.ramp(sendGainNode.gain, mappedValue, smoothing, 'linear');
                        } else {
                            console.warn(
                                `[AudioBus] Cannot bind RTPC to sendLevel for "${targetBusId}". Send does not exist. Initialize it in the config first with { sends: { ${targetBusId}: 0 } }.`
                            );
                        }
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
            this.automation!.ramp(biquadNode.frequency, config.frequency, 30, 'exponential');
        }

        if (config.Q !== undefined && biquadNode.Q) {
            this.automation!.ramp(biquadNode.Q, config.Q, 30, 'linear');
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
