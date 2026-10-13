/* eslint-disable no-underscore-dangle */
// oxlint-disable no-underscore-dangle typescript/no-unsafe-assignment
// noinspection D

import type { ISoundControllerProxy, ISoundInstanceProxy } from './types/EngineProxies.js';

interface VoiceAccumulator {
    hw: number;
    virtual: number;
    dump: Array<{ name: string; isVirtual: boolean }>;
}

export class AudioProfiler {
    public readonly metrics = {
        voices: {
            hardwareActive: 0,
            virtualCulled: 0,
            totalTracked: 0,
            dump: [] as Array<{ name: string; isVirtual: boolean }>
        },
        mixer: {
            globalSnapshot: 'None',
            activeLayers: 'None'
        },
        buses: {} as Record<string, string>
    };

    private lastUpdate = 0;
    private readonly throttleMs = 100;
    private readonly engine: any;

    constructor(engineInstance: any) {
        this.engine = engineInstance;

        const buses = this.engine._debug?.config?.buses;
        if (buses) {
            for (const busId of Object.keys(buses)) {
                this.metrics.buses[busId] = 'N/A';
            }
        }
    }

    public tick(): void {
        const now = performance.now();
        if (now - this.lastUpdate < this.throttleMs) return;
        this.lastUpdate = now;

        this.updateVoiceMetrics();
        this.updateMixerMetrics();
        this.updateBusMetrics();
    }

    private getSoundController(): ISoundControllerProxy | undefined {
        // oxlint-disable-next-line typescript/no-unsafe-return
        return (
            this.engine._debug?.soundController ??
            this.engine._debug?.router?.['#soundController'] ??
            this.engine._debug?.router?.soundController ??
            this.engine._debug?.eventOrchestrator?.soundController
        );
    }

    private recordVoice(acc: VoiceAccumulator, name: string, isVirtual: boolean, state?: string): void {
        if (isVirtual) {
            acc.virtual++;
            acc.dump.push({
                name,
                isVirtual: true
            });
        } else if (state !== 'stopped') {
            acc.hw++;
            acc.dump.push({
                name,
                isVirtual: false
            });
        }
    }

    private collectFromVoiceMap(
        controller: ISoundControllerProxy,
        voices: Map<unknown, any>,
        acc: VoiceAccumulator
    ): void {
        for (const [id, voice] of voices.entries()) {
            // oxlint-disable-next-line typescript/no-unnecessary-type-conversion
            const isGhost = Boolean(
                voice?.isVirtualNode || (typeof controller.isGhostVoice === 'function' && controller.isGhostVoice(id))
            );
            const state =
                typeof controller.getPlaybackState === 'function'
                    ? controller.getPlaybackState(id)
                    : voice?.physicalInstance?.state;
            const isVirtual = isGhost || state === 'virtual';

            const name =
                voice?.soundId ??
                (typeof controller.getSoundId === 'function' ? controller.getSoundId(id) : undefined) ??
                String(id);

            this.recordVoice(acc, name, isVirtual, state);
        }
    }

    private collectFromPlaybackIds(
        controller: ISoundControllerProxy,
        ids: readonly unknown[],
        acc: VoiceAccumulator
    ): void {
        for (const id of ids) {
            const isGhost = typeof controller.isGhostVoice === 'function' && controller.isGhostVoice(id);
            const state =
                typeof controller.getPlaybackState === 'function' ? controller.getPlaybackState(id) : undefined;
            // oxlint-disable-next-line typescript/no-unnecessary-type-conversion
            const isVirtual = Boolean(isGhost || state === 'virtual');
            const name =
                (typeof controller.getSoundId === 'function' ? controller.getSoundId(id) : undefined) ?? String(id);

            this.recordVoice(acc, name, isVirtual, state);
        }
    }

    private collectFromSoundController(controller: ISoundControllerProxy, acc: VoiceAccumulator): void {
        const activeVoices = controller.activeVoices;
        if (activeVoices instanceof Map) {
            this.collectFromVoiceMap(controller, activeVoices, acc);
        } else if (typeof controller.getActivePlaybacks === 'function') {
            this.collectFromPlaybackIds(controller, controller.getActivePlaybacks(), acc);
        }
    }

    private collectFromPoolManager(acc: VoiceAccumulator): void {
        const pool = this.engine._debug?.poolManager;
        if (!pool || typeof pool.getActiveVoices !== 'function') return;

        const activeVoices = pool.getActiveVoices() as ReadonlySet<ISoundInstanceProxy>;
        for (const voice of activeVoices) {
            const isVirtual = voice.state === 'virtual';
            if (isVirtual) {
                acc.virtual++;
            } else {
                acc.hw++;
            }

            acc.dump.push({
                name: voice.id,
                isVirtual
            });
        }
    }

    private updateVoiceMetrics(): void {
        const soundController = this.getSoundController();
        const acc: VoiceAccumulator = { hw: 0, virtual: 0, dump: [] };

        if (soundController) {
            this.collectFromSoundController(soundController, acc);
        } else {
            this.collectFromPoolManager(acc);
        }

        this.metrics.voices.hardwareActive = acc.hw;
        this.metrics.voices.virtualCulled = acc.virtual;
        this.metrics.voices.totalTracked = acc.hw + acc.virtual;
        this.metrics.voices.dump = acc.dump;
    }

    private updateMixerMetrics(): void {
        const stack = this.engine._debug?.layerStack;
        if (!stack || !stack.layers) return;

        const allLayers = [...(stack.layers as Map<string, any>).values()]
            // oxlint-disable-next-line unicorn/no-array-sort
            .sort((a, b) => a.priority - b.priority);

        const baseLayer = allLayers.find(l => l.priority === 0);

        const currentSnapshot = baseLayer?.snapshot?.metadata?.snapshotId ?? '[No Base Snapshot]';

        const overlays = allLayers
            .filter(l => l.priority > 0)
            .map(l => {
                const snapId = l.snapshot?.metadata?.snapshotId;
                return snapId ? `${l.id} (${snapId})` : l.id;
            });

        this.metrics.mixer.globalSnapshot = currentSnapshot;
        this.metrics.mixer.activeLayers = overlays.length > 0 ? overlays.join(' -> ') : '[No Overlays]';
    }

    private updateBusMetrics(): void {
        const busSystem = this.engine._debug?.busSystem;
        if (!busSystem) return;

        busSystem.getAllBuses().forEach((bus: any, id: string) => {
            const target = bus.targetParams;
            if (target && target.gain) {
                const logical = target.gain.logical.toFixed(2);
                const rtpc = target.gain.rtpc.toFixed(2);
                const final = bus.logicalTargetGain.toFixed(2);

                this.metrics.buses[id] = `Base: ${logical} × RTPC: ${rtpc} = ${final}`;
            } else {
                this.metrics.buses[id] = `Final: ${(bus.logicalTargetGain ?? 0).toFixed(2)}`;
            }
        });
    }
}
