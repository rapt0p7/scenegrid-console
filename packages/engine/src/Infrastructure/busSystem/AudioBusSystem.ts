// noinspection D

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem';
import type { IBus, IBuses } from '@domain/BusSystem/Ports/IBuses.js';
import type { IDuckingConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type { EngineTicker } from '@infrastructure/scheduling/EngineTicker.js';
import type { AudioCtx, AudioNodeLike, GainNodeLike } from '@infrastructure/types/IAudioContext.js';
import type { ILimiterNode, IPluginFactory, ISidechain } from '@infrastructure/types/IAudioPlugins.js';
import type { IMasterOutput } from '@infrastructure/types/IMasterOutput.js';

import AudioBus from '@infrastructure/busSystem/AudioBus.js';
import { safeDisconnect } from '@infrastructure/utils/safeDisconnect.js';
import { BusId, TickerTaskId, Milliseconds, ContextTime, TimeMath } from '@scene-grid/shared';
import { typedEntries, typedKeys, isDefined } from '@scene-grid/shared';

export default class AudioBusSystem implements IAudioBusSystem {
    private readonly context: AudioCtx;
    private busConfig: IBuses | null = null;
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
    private readonly TICK_DIVIDER: number = 2;
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
            await this.initLimiter();
        } else {
            this.routerMasterGain.connect(this.postLimiterGain);
        }

        await this.initBuses();

        ticker.add('audio-bus-system' as TickerTaskId, this.TICK_DIVIDER, this);
    }

    public tick(currentTime: ContextTime) {
        const length = this.hotPathBuses.length;
        for (let index = 0; index < length; index++) {
            this.hotPathBuses[index].processFrame(TimeMath.castToSeconds(currentTime));
        }
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

    public getBaseBusConfig(busId: BusId): IBus | undefined {
        if (!this.busConfig) return undefined;
        return this.busConfig[busId];
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

    public addSidechainSource(node: AudioNodeLike, busId: BusId, intensity: number): void {
        const sidechain = this.sidechains.get(busId);
        if (sidechain) {
            sidechain.addSource(node, intensity);
        }
    }

    public removeSidechainSource(node: AudioNodeLike, busId: BusId): void {
        const sidechain = this.sidechains.get(busId);
        if (sidechain) {
            sidechain.removeSource(node);
        }
    }

    public clearAllSidechainTriggers(): void {
        for (const sidechain of this.sidechains.values()) {
            sidechain.removeAllSources();
        }
    }

    // eslint-disable-next-line max-params
    public applySend(
        sourceBusId: BusId,
        targetBusId: BusId,
        gain: number | null,
        duration: Milliseconds = 0 as Milliseconds
    ): void {
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
                duration
            });
        }
    }

    public getBusLogicalGain(busId: BusId): number | undefined {
        const bus = this.buses.get(busId);
        return bus?.getTargetParamsGain().logical;
    }

    public getBusRtpcGain(busId: BusId): number | undefined {
        const bus = this.buses.get(busId);
        return bus?.getTargetParamsGain().rtpc;
    }

    public getBusFinalGain(busId: BusId): number | undefined {
        const bus = this.buses.get(busId);
        if (!bus) return undefined;

        const logicalTarget = bus.getLogicalTargetGain();
        const sidechainGain = this.getSidechainGain(busId);

        return logicalTarget * sidechainGain;
    }

    public getSidechainGain(busId: BusId): number {
        const sidechain = this.getSidechain(busId);

        return 1 - (sidechain?.activeEnvelope ?? 0);
    }

    public fillActiveModifiers(
        busId: BusId,
        outModifiers: Array<{ type: string; value: number; source: string }>
    ): number {
        const bus = this.buses.get(busId);
        if (!bus) return 0;

        let count = 0;

        const targetParams = bus.getTargetParamsGain();
        if (targetParams.logical !== 1) {
            outModifiers[count].type = 'LOGICAL';
            outModifiers[count].value = targetParams.logical;
            outModifiers[count].source = 'Mixer Snapshot';
            count++;
        }

        if (targetParams.rtpc !== 1) {
            outModifiers[count].type = 'RTPC';
            outModifiers[count].value = targetParams.rtpc;
            outModifiers[count].source = 'Game Parameter';
            count++;
        }

        const sidechainGain = this.getSidechainGain(busId);
        if (sidechainGain < 1) {
            outModifiers[count].type = 'SIDECHAIN';
            outModifiers[count].value = sidechainGain;
            outModifiers[count].source = 'Active Ducking';
            count++;
        }

        return count;
    }

    /**
     * @internal Hot Module Replacement API
     * Soft-reloads the bus system configuration without stopping the audio context.
     */
    public async updateConfig(newConfig: IBuses): Promise<void> {
        const previousBusesConfig = this.busConfig;
        this.busConfig = newConfig;

        for (const [busId, busConfig] of typedEntries(newConfig)) {
            this.upsertBus(busId as BusId, busConfig);
        }

        const promises: Promise<void>[] = [];
        for (const [busId, busConfig] of typedEntries(newConfig)) {
            const typedBusId = busId as BusId;
            this.syncBusSends(typedBusId, busConfig, previousBusesConfig?.[busId]);

            const sidechainPromise = this.syncBusSidechain(typedBusId, busConfig);
            if (sidechainPromise) {
                promises.push(sidechainPromise);
            }
        }

        await Promise.all(promises);
    }

    private createAndRegisterBus(busId: BusId, busConfig: IBus): AudioBus {
        const bus = new AudioBus({
            id: busId,
            config: busConfig,
            context: this.context,
            automation: this.automation!,
            routerMasterGain: this.masterBus,
            pluginFactory: this.pluginFactory
        });
        this.buses.set(busId, bus);
        this.hotPathBuses.push(bus);
        return bus;
    }

    private upsertBus(busId: BusId, busConfig: IBus): void {
        const bus = this.buses.get(busId) ?? this.createAndRegisterBus(busId, busConfig);

        bus.bindRTPC(busConfig.rtpc);
        bus.safeReplaceFilter(busConfig.filter ?? null, 100 as Milliseconds);
    }

    private applyBusSends(busId: BusId, sends: Record<BusId, number> | undefined, duration: Milliseconds): void {
        if (!sends) return;

        for (const [targetBusId, sendGain] of typedEntries(sends)) {
            this.applySend(busId, targetBusId, sendGain, duration);
        }
    }

    private syncBusSends(busId: BusId, busConfig: IBus, oldBusConfig?: IBus): void {
        this.applyBusSends(busId, busConfig.sends, 100 as Milliseconds);

        if (!oldBusConfig?.sends) return;

        for (const targetBusId of typedKeys(oldBusConfig.sends)) {
            const isStillExists = busConfig.sends && isDefined(busConfig.sends[targetBusId]);

            if (!isStillExists) {
                this.applySend(busId, targetBusId, null, 100 as Milliseconds);
            }
        }
    }

    private syncBusSidechain(busId: BusId, busConfig: IBus): Promise<void> | undefined {
        const isEnabled = Boolean(busConfig.sidechain?.enabled);
        const hasSidechain = this.sidechains.has(busId);

        if (isEnabled && !hasSidechain) {
            return this.createSidechain(busId);
        }

        if (!isEnabled && hasSidechain) {
            this.sidechains.get(busId)?.dispose();
            this.sidechains.delete(busId);
        }

        return undefined;
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

        const result = await ducker.start();
        if (result && !result.ok) {
            console.error(`[AudioBusSystem] Failed to start sidechain for bus '${busId}'`, result.error);
            ducker.dispose();
            return;
        }

        ducker.insertLookahead(bus.duckerTapNode);
        this.sidechains.set(busId, ducker);
    }

    private async initLimiter(): Promise<void> {
        this.masterLimiter = this.pluginFactory.createLimiter();

        let loaded = true;
        if (this.masterLimiter.load) {
            const result = await this.masterLimiter.load();
            if (result && !result.ok) {
                loaded = false;
                console.warn(
                    `[AudioBusSystem] Custom limiter failed to load. Falling back to native DynamicsCompressorNode.`,
                    result.error
                );
            }
        }

        if (loaded) {
            this.routerMasterGain.connect(this.masterLimiter.inputNode);
            this.masterLimiter.outputNode.connect(this.postLimiterGain);
        } else {
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
                    safeDisconnect(fallbackNode);
                }
            };
        }
    }

    private async initBuses(): Promise<void> {
        for (const [busId, busConfig] of typedEntries(this.busConfig!)) {
            const bus = this.createAndRegisterBus(busId as BusId, busConfig);

            if (busConfig.rtpc) {
                bus.bindRTPC(busConfig.rtpc);
            }
        }

        const promises: Promise<void>[] = [];

        for (const [busId, busConfig] of typedEntries(this.busConfig!)) {
            const typedBusId = busId as BusId;
            this.applyBusSends(typedBusId, busConfig.sends, 0 as Milliseconds);

            if (busConfig.sidechain?.enabled) {
                promises.push(this.createSidechain(typedBusId));
            }
        }

        await Promise.all(promises);
    }
}
