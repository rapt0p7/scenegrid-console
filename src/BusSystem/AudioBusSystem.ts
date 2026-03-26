import { safeDisconnect } from '@webaudio-core';

import AudioBus from './AudioBus';

import type { IAudioBusSystem, BusId } from '../interfaces/IAudioBusSystem';
import type { ILimiterNode, IPluginFactory, ISidechain } from '../interfaces/IAudioPlugins';
import type { IBuses } from '../interfaces/IBuses';
import type { IDuckingConfig } from '../interfaces/ISoundConfig';
import type {
    AudioCtx,
    AudioNodeLike,
    GainNodeLike,
    ISoundInstance,
    AutomationEngine,
    MasterOutput
} from '@webaudio-core';

export default class AudioBusSystem implements IAudioBusSystem {
    private readonly context: AudioCtx;
    private readonly busConfig: IBuses | null = null;
    private readonly automation: AutomationEngine | null = null;
    private readonly buses: Map<BusId, AudioBus> = new Map();
    private readonly isUseLimiter: boolean;
    private readonly sidechains: Map<string, ISidechain> = new Map();
    private readonly routerMasterGain: GainNodeLike;
    private readonly masterBus: GainNodeLike;
    private readonly postLimiterGain: GainNodeLike;
    private readonly masterOutput: MasterOutput;
    private readonly pluginFactory: IPluginFactory;
    private masterLimiter?: ILimiterNode;
    constructor(
        {
            context,
            automation,
            masterOutput,
            busConfig,
            pluginFactory
        }: {
            context: AudioCtx;
            automation: AutomationEngine;
            masterOutput: MasterOutput;
            busConfig: IBuses;
            pluginFactory: IPluginFactory;
        },

        { isUseLimiter = true } = {}
    ) {
        this.busConfig = busConfig;
        this.isUseLimiter = isUseLimiter;
        this.context = context;
        this.automation = automation;
        this.masterOutput = masterOutput;
        this.pluginFactory = pluginFactory;
        this.routerMasterGain = context.createGain();
        this.postLimiterGain = context.createGain();
        this.postLimiterGain.connect(masterOutput.input);
        this.routerMasterGain.gain.value = 1;
        this.masterBus = context.createGain();
        this.masterBus.gain.value = 1;
        this.masterBus.connect(this.routerMasterGain);

        if (this.isUseLimiter) {
            this.initLimiter().catch(error => {
                console.error('[AudioBusSystem] Critical failure during limiter initialization', error);
            });
        } else {
            this.routerMasterGain.connect(this.postLimiterGain);
        }

        void this.initBuses();
    }

    public getAllBuses(): ReadonlyMap<BusId, AudioBus> {
        return this.buses;
    }

    public getMasterNode(): GainNodeLike {
        return this.postLimiterGain;
    }

    getCurrentRealGain(busId: BusId): number {
        const bus = this.getBus(busId);
        if (!bus) return 0;

        const mixerGain = bus.inputGainNode.gain.value;
        const sidechain = this.getSidechain(busId);

        if (sidechain) {
            return mixerGain * (1 - sidechain.activeEnvelope);
        }

        return mixerGain;
    }

    computeOfflineGainTransition(busId: BusId, nextGain: number): { from: number; to: number } {
        const current = this.getCurrentRealGain(busId);

        if (!this.sidechains.get(busId)) {
            return { from: current, to: nextGain };
        }

        const sc = this.sidechains.get(busId);

        if (!sc) {
            return { from: current, to: nextGain };
        }

        const currentEffective = current;
        const futureEffective = nextGain * (1 - sc.activeEnvelope);

        return { from: currentEffective, to: futureEffective };
    }

    getSidechain(busId: string): ISidechain | undefined {
        return this.sidechains.get(busId);
    }

    getBus(id: BusId): AudioBus | undefined {
        return this.buses.get(id);
    }

    routeInstance(instance: ISoundInstance, busId: BusId): void {
        const bus = this.getBus(busId);
        if (!bus || this.context.state !== 'running') return;

        const node = instance.outputNode;

        if (node) {
            try {
                safeDisconnect(node);
                node.connect(bus.inputGainNode);
            } catch (error) {
                console.warn(`[AudioBusSystem] Routing failed. Web Audio context error.`, error);
            }
        }
    }

    // eslint-disable-next-line max-params
    public applySend(sourceBusId: BusId, targetBusId: BusId, gain: number | null, durationMs: number = 0): void {
        const sourceBus = this.getBus(sourceBusId);
        const targetBus = this.getBus(targetBusId);

        if (!sourceBus) return;

        if (!targetBus && gain !== null) {
            console.warn(`[AudioBusSystem] Cannot send from ${sourceBusId}: target bus ${targetBusId} not found.`);
            return;
        }

        const targetInputNode = targetBus ? targetBus.inputGainNode : null;

        if (targetInputNode || gain === null) {
            sourceBus.updateSend({
                targetBusId: targetBusId,
                targetNode: targetInputNode as AudioNodeLike,
                targetGain: gain,
                durationMs
            });
        }
    }

    private async createSidechain(busId: BusId, options: IDuckingConfig = {}): Promise<undefined | null> {
        const bus = this.getBus(busId);
        if (!bus) return null;

        const ducker = this.pluginFactory.createSidechain(bus.inputGainNode, options);

        ducker.insertLookahead(bus.preFilterGain);
        this.sidechains.set(busId, ducker);
        await ducker.start();
    }

    private async initLimiter(): Promise<void> {
        try {
            this.masterLimiter = this.pluginFactory.createLimiter();

            if (this.masterLimiter.load) {
                await this.masterLimiter.load();
            }

            this.routerMasterGain.connect(this.masterLimiter.inputNode);
            this.masterLimiter.outputNode.connect(this.postLimiterGain);
        } catch (error) {
            console.warn(
                `[AudioBusSystem] Custom limiter failed to load. Falling back to native DynamicsCompressorNode.`,
                error
            );

            const fallbackNode = this.context.createDynamicsCompressor();
            fallbackNode.threshold.value = -3;
            fallbackNode.knee.value = 0;
            fallbackNode.ratio.value = 20;
            fallbackNode.attack.value = 0;
            fallbackNode.release.value = 0.1;

            this.routerMasterGain.connect(fallbackNode);
            fallbackNode.connect(this.postLimiterGain);

            this.masterLimiter = {
                inputNode: fallbackNode,
                outputNode: fallbackNode,
                dispose: () => {
                    try {
                        fallbackNode.disconnect();
                    } catch {
                        /* empty */
                    }
                }
            };
        }
    }

    private async initBuses(): Promise<void> {
        for (const [busId, busConfig] of Object.entries(this.busConfig!)) {
            const bus = new AudioBus({
                id: busId as BusId,
                config: busConfig,
                context: this.context,
                automation: this.automation!,
                routerMasterGain: this.masterBus,
                pluginFactory: this.pluginFactory
            });
            this.buses.set(busId as BusId, bus);
        }

        for (const [busId, busConfig] of Object.entries(this.busConfig!)) {
            if (busConfig.sends) {
                for (const [targetBusId, sendGain] of Object.entries(busConfig.sends)) {
                    this.applySend(busId as BusId, targetBusId as BusId, sendGain, 0);
                }
            }
            if (busConfig.sidechain?.enabled) {
                await this.createSidechain(busId);
            }
        }
    }
}
