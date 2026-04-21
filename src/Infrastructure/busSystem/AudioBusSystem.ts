import AudioBus from '@infrastructure/busSystem/AudioBus.js';
import { safeDisconnect } from '@infrastructure/utils/safeDisconnect.js';

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem';
import type { IBuses } from '@domain/BusSystem/Ports/IBuses.js';
import type { IDuckingConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { BusId } from '@shared/Types/Branded.js';
import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type { EngineTicker } from '@infrastructure/scheduling/EngineTicker.js';
import type { AudioCtx, AudioNodeLike, GainNodeLike } from '@infrastructure/types/IAudioContext.js';
import type { ILimiterNode, IPluginFactory, ISidechain } from '@infrastructure/types/IAudioPlugins.js';
import type { IMasterOutput } from '@infrastructure/types/IMasterOutput.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';

export default class AudioBusSystem implements IAudioBusSystem {
    private readonly context: AudioCtx;
    private readonly busConfig: IBuses | null = null;
    private readonly automation: AutomationEngine | null = null;
    private readonly buses: Map<BusId, AudioBus> = new Map();
    private readonly hotPathBuses: AudioBus[] = [];
    private readonly isUseLimiter: boolean;
    private readonly sidechains: Map<string, ISidechain> = new Map();
    private readonly routerMasterGain: GainNodeLike;
    private readonly masterBus: GainNodeLike;
    private readonly postLimiterGain: GainNodeLike;
    private readonly masterOutput: IMasterOutput;
    private readonly pluginFactory: IPluginFactory;
    private masterLimiter?: ILimiterNode;
    private readonly TICK_RATE_MS = 20;
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
            masterOutput: IMasterOutput;
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
    }

    public async initialize(ticker: EngineTicker): Promise<void> {
        if (this.isUseLimiter) {
            try {
                await this.initLimiter();
            } catch (error) {
                console.error('[AudioBusSystem] Critical failure during limiter initialization', error);
            }
        } else {
            this.routerMasterGain.connect(this.postLimiterGain);
        }

        await this.initBuses();

        ticker.add('audio-bus-system', this.TICK_RATE_MS, currentTime => {
            const length = this.hotPathBuses.length;
            for (let index = 0; index < length; index++) {
                this.hotPathBuses[index].processFrame(currentTime);
            }
        });
    }

    public tickRTPC(rtpcAdapter: IRTPCAdapter): void {
        const length = this.hotPathBuses.length;
        for (let index = 0; index < length; index++) {
            this.hotPathBuses[index].tickRTPC(rtpcAdapter);
        }
    }

    public getDefaultGain(busId: BusId): number {
        if (!this.busConfig) {
            return 0;
        }

        return this.busConfig[busId].gain ?? 0;
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

        const mixerGain = bus.inputNode.gain.value;
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

    public connectNodeToBus(node: AudioNodeLike, busId: BusId): void {
        const bus = this.getBus(busId);
        if (!bus || this.context.state !== 'running') return;

        try {
            safeDisconnect(node);
            node.connect(bus.inputNode);
        } catch (error) {
            console.warn(`[AudioBusSystem] Routing failed.`, error);
        }
    }

    public addSidechainSource(node: AudioNodeLike, busId: BusId, intensity: number): void {
        const sidechain = this.sidechains.get(busId);
        if (sidechain) {
            try {
                sidechain.addSource(node, intensity);
            } catch (error) {
                console.warn(`[AudioBusSystem] Failed to add source to sidechain "${busId}"`, error);
            }
        }
    }

    public removeSidechainSource(node: AudioNodeLike, busId: BusId): void {
        const sidechain = this.sidechains.get(busId);
        if (sidechain) {
            try {
                sidechain.removeSource(node);
            } catch {
                /* empty */
            }
        }
    }

    public clearAllSidechainTriggers(): void {
        for (const sidechain of this.sidechains.values()) {
            try {
                sidechain.removeAllSources();
            } catch (error) {
                console.warn('[AudioBusSystem] Failed to clear sidechain sources', error);
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

        const targetInputNode = targetBus ? targetBus.inputNode : null;

        if (targetInputNode || gain === null) {
            sourceBus.updateSend({
                targetBusId: targetBusId,
                targetNode: targetInputNode as AudioNodeLike,
                targetGain: gain,
                durationMs
            });
        }
    }

    private async createSidechain(busId: BusId, options: IDuckingConfig = {}): Promise<void> {
        const bus = this.getBus(busId);
        if (!bus) {
            console.warn(`[AudioBusSystem] Cannot create sidechain: Bus '${busId}' not found.`);
            return;
        }

        if (this.sidechains.has(busId)) {
            console.warn(`[AudioBusSystem] Sidechain for bus '${busId}' already exists. Disposing old instance.`);
            const oldDucker = this.sidechains.get(busId);
            oldDucker?.dispose();
            this.sidechains.delete(busId);
        }

        const ducker = this.pluginFactory.createSidechain(bus.inputNode, options);

        try {
            await ducker.start();

            ducker.insertLookahead(bus.duckerTapNode);

            this.sidechains.set(busId, ducker);
        } catch (error) {
            console.error(`[AudioBusSystem] Failed to start sidechain for bus '${busId}'`, error);
            ducker.dispose();
        }
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
            this.hotPathBuses.push(bus);
        }

        const promises = [];

        for (const [busId, busConfig] of Object.entries(this.busConfig!)) {
            if (busConfig.sends) {
                for (const [targetBusId, sendGain] of Object.entries(busConfig.sends)) {
                    this.applySend(busId as BusId, targetBusId as BusId, sendGain, 0);
                }
            }
            if (busConfig.sidechain?.enabled) {
                promises.push(this.createSidechain(busId as BusId));
            }
        }

        await Promise.all(promises);
    }
}
