/* eslint-disable no-underscore-dangle */
// oxlint-disable no-underscore-dangle typescript/no-unsafe-assignment
// noinspection D

import type { ISoundControllerProxy, ISoundInstanceProxy } from './types/EngineProxies.js';

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

    // oxlint-disable-next-line max-lines-per-function
    private updateVoiceMetrics(): void {
        const soundController = this.getSoundController();

        let hw = 0;
        let virtual = 0;
        const currentDump: Array<{ name: string; isVirtual: boolean }> = [];

        if (soundController) {
            const activeVoices = soundController.activeVoices;
            if (activeVoices instanceof Map) {
                for (const [id, voice] of activeVoices.entries()) {
                    // oxlint-disable-next-line typescript/no-unnecessary-type-conversion
                    const isGhost = Boolean(
                        voice?.isVirtualNode ||
                        (typeof soundController.isGhostVoice === 'function' && soundController.isGhostVoice(id))
                    );
                    const state =
                        typeof soundController.getPlaybackState === 'function'
                            ? soundController.getPlaybackState(id)
                            : voice?.physicalInstance?.state;
                    const isVirtual = isGhost || state === 'virtual';

                    const name =
                        voice?.soundId ??
                        (typeof soundController.getSoundId === 'function'
                            ? soundController.getSoundId(id)
                            : undefined) ??
                        String(id);

                    if (isVirtual) {
                        virtual++;
                        currentDump.push({
                            name,
                            isVirtual: true
                        });
                    } else if (state !== 'stopped') {
                        hw++;
                        currentDump.push({
                            name,
                            isVirtual: false
                        });
                    }
                }
            } else if (typeof soundController.getActivePlaybacks === 'function') {
                const activeIds = soundController.getActivePlaybacks();
                for (const id of activeIds) {
                    const isGhost =
                        typeof soundController.isGhostVoice === 'function' && soundController.isGhostVoice(id);
                    const state =
                        typeof soundController.getPlaybackState === 'function'
                            ? soundController.getPlaybackState(id)
                            : undefined;
                    // oxlint-disable-next-line typescript/no-unnecessary-type-conversion
                    const isVirtual = Boolean(isGhost || state === 'virtual');
                    const name =
                        (typeof soundController.getSoundId === 'function'
                            ? soundController.getSoundId(id)
                            : undefined) ?? String(id);

                    if (isVirtual) {
                        virtual++;
                        currentDump.push({
                            name,
                            isVirtual: true
                        });
                    } else if (state !== 'stopped') {
                        hw++;
                        currentDump.push({
                            name,
                            isVirtual: false
                        });
                    }
                }
            }
        } else {
            const pool = this.engine._debug?.poolManager;
            if (pool && typeof pool.getActiveVoices === 'function') {
                const activeVoices = pool.getActiveVoices() as ReadonlySet<ISoundInstanceProxy>;
                for (const voice of activeVoices) {
                    const isVirtual = voice.state === 'virtual';
                    if (isVirtual) {
                        virtual++;
                    } else {
                        hw++;
                    }

                    currentDump.push({
                        name: voice.id,
                        isVirtual
                    });
                }
            }
        }

        this.metrics.voices.hardwareActive = hw;
        this.metrics.voices.virtualCulled = virtual;
        this.metrics.voices.totalTracked = hw + virtual;
        this.metrics.voices.dump = currentDump;
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
