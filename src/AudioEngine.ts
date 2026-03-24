// noinspection D

import {
    AutomationEngine,
    AudioContextManager,
    SoundInstance,
    SoundPoolManager,
    AudioBufferLoader,
    SoundController,
    AudioNodeFactory,
    MasterOutput,
    PlaybackScheduler,
    VoiceCullingSystem
} from '@webaudio-core';

import AudioRouter from './AudioRouter';
import AudioBusSystem from './BusSystem/AudioBusSystem';
import ConsistencyChecker from './Core/ConsistencyChecker';
import FiltersPlugin from './Core/FiltersPlugin';
import SidechainDucker from './Core/SidechainDucker';
import TinyLimiterNode from './Core/TinyLimiterNode';
import deepFreeze from './helpers/deepFreeze';
import ContainerManager from './Managers/ContainerManager';
import DuckingManager from './Managers/DuckingManager';
import MixerCoordinator from './Managers/MixerCoordinator';
import MixerLayerStack from './Managers/MixerLayer';
import MixerSnapshotManager from './Managers/MixerSnapshotManager';
import MixerStateManager from './Managers/MixerStateManager';
import MixerStateResolver from './Managers/MixerStateResolver';
import RTPCManager from './Managers/RTPCManager';
import SmartLoopManager from './Managers/SmartLoopManager';
import SoundRegistry from './SoundRegistry';

import type { DebuggerOptions } from './Debug/AudioDebugger';
import type { BusId } from './interfaces/IAudioBusSystem';
import type { IAudioEngineConfig } from './interfaces/IAudioEngineConfig';
import type { IPluginFactory } from './interfaces/IAudioPlugins';
import type { ITransitionToParameters } from './interfaces/ISmartLoopManager';
import type { IPlayOptions } from './interfaces/ISoundConfig';

export class AudioEngine {
    #contextManager!: AudioContextManager;
    #router!: AudioRouter;
    #busSystem!: AudioBusSystem;
    #soundController!: SoundController;
    #rtpcManager!: RTPCManager;
    #snapshotManager!: MixerSnapshotManager;
    #smartLoopManager!: SmartLoopManager;
    #cullingSystem!: VoiceCullingSystem;
    #masterOutput!: MasterOutput;
    #isInitialized = false;

    public readonly params = {
        set: (parameterName: string, value: number) => this.#rtpcManager.setValue(parameterName, value),
        get: (parameterName: string) => this.#rtpcManager.getValue(parameterName)
    };

    public readonly mixer = {
        push: (snapshotName: string, layerId: string, priority: number) =>
            this.#snapshotManager.activateSnapshot(snapshotName, layerId, priority),
        pop: (layerId: string) => this.#snapshotManager.clearLayer(layerId)
    };

    public readonly music = {
        playLoop: (soundId: string, region: string) => this.#smartLoopManager.playLoop(soundId, region),
        stopLoop: (soundId: string) => this.#smartLoopManager.stopLoop(soundId),
        transitionTo: (options: ITransitionToParameters) => this.#smartLoopManager.transitionTo(options)
    };
    public readonly spatial = {
        setListenerPosition: (x: number, y: number, z: number) => {
            this.#contextManager.setListenerPosition(x, y, z);
        },

        setListenerOrientation: ({
            fx,
            fy,
            fz,
            ux,
            uy,
            uz
        }: {
            fx: number;
            fy: number;
            fz: number;
            ux: number;
            uy: number;
            uz: number;
        }) => {
            this.#contextManager.setListenerOrientation(fx, fy, fz, ux, uy, uz);
        },

        setSoundPosition: ({
            playbackId,
            x,
            y,
            z
        }: {
            playbackId: number | number[];
            x: number;
            y: number;
            z: number;
        }) => {
            const ids = Array.isArray(playbackId) ? playbackId : [playbackId];

            for (const id of ids) {
                this.#soundController.setPosition(id, x, y, z);
            }
        }
    };
    public readonly config: Readonly<IAudioEngineConfig>;

    constructor(config: IAudioEngineConfig) {
        this.config = deepFreeze<IAudioEngineConfig>({ ...config });
    }

    public async init(): Promise<void> {
        if (this.#isInitialized) return;

        const isConfigValid = ConsistencyChecker.validate(this.config);
        if (!isConfigValid) {
            console.warn('[AudioEngine] Engine initialized with errors. Some features may not work correctly.');
        }

        this.#contextManager = new AudioContextManager(44_100);
        const automation = new AutomationEngine(this.#contextManager.context);
        this.#contextManager.initSpatial(automation);
        const nodeFactory = new AudioNodeFactory(this.#contextManager);
        const scheduler = new PlaybackScheduler(this.#contextManager);
        const bufferLoader = new AudioBufferLoader(this.#contextManager);
        this.#masterOutput = new MasterOutput(this.#contextManager, automation);
        this.#rtpcManager = new RTPCManager();

        const soundRegistry = new SoundRegistry();
        await this.loadSounds(this.config.manifest, bufferLoader, soundRegistry);

        const instanceFactory = (soundId: string) => {
            const { buffer, options } = soundRegistry.get(soundId);
            const soundConfig = this.config.soundMap[soundId] as any;

            const instanceOptions = {
                ...options,
                spatial: soundConfig?.spatial,
                hasPanner: soundConfig?.hasPanner
            };

            return new SoundInstance(soundId, this.#contextManager, nodeFactory, buffer, automation, instanceOptions);
        };

        const soundPool = new SoundPoolManager(instanceFactory, {
            globalVoiceLimit: this.config.globalVoiceLimit ?? 32,
            voiceConfigResolver: (soundId: string) => {
                const cfg = this.config.soundMap[soundId];
                return cfg && 'voice' in cfg ? cfg.voice : undefined;
            }
        });

        this.#soundController = new SoundController(soundPool, scheduler, soundRegistry.registry);

        const pluginFactory: IPluginFactory = {
            createLimiter: () =>
                new TinyLimiterNode(this.#contextManager.context, { lookahead: 0.008, ceiling: 0.98, release: 0.12 }),
            createSidechain: (target, options) =>
                new SidechainDucker({
                    ctx: this.#contextManager.context,
                    automation,
                    masterOutput: this.#masterOutput,
                    targetGainNode: target,
                    ...options
                }),
            getFiltersPlugin: () => FiltersPlugin
        };

        this.#busSystem = new AudioBusSystem(
            {
                context: this.#contextManager.context,
                automation,
                masterOutput: this.#masterOutput,
                busConfig: this.config.buses,
                pluginFactory
            },
            { isUseLimiter: true }
        );

        const duckingManager = new DuckingManager(this.#busSystem);
        const containerManager = new ContainerManager();

        this.#router = new AudioRouter({
            soundController: this.#soundController,
            busSystem: this.#busSystem,
            duckingManager,
            rtpcManager: this.#rtpcManager,
            containerManager,
            soundMap: this.config.soundMap
        });

        this.#smartLoopManager = new SmartLoopManager(this.#soundController, this.#router, automation);

        const resolver = new MixerStateResolver({ defaultBusGain: 1 });

        const layerStack = new MixerLayerStack(resolver, async () => {
            await coordinator.recompute({ durationMs: 500 });
        });

        const mixerStateManager = new MixerStateManager(this.#busSystem, automation, this.#rtpcManager);
        const coordinator = new MixerCoordinator(layerStack, mixerStateManager);
        this.#snapshotManager = new MixerSnapshotManager(layerStack, this.config.snapshots, coordinator);

        this.#cullingSystem = new VoiceCullingSystem(soundPool, {
            checkIntervalMs: 500,
            cullingThreshold: 0.01,
            busIdResolver: id => this.config.soundMap[id]?.busId,
            busVolumeResolver: busId => {
                const bus = this.#busSystem.getBus(busId as BusId);
                return bus ? Math.max(bus.inputGainNode.gain.value, bus.logicalTargetGain) : 1;
            }
        });

        this.#cullingSystem.start();
        this.#isInitialized = true;
        console.log('[AudioEngine] Successfully Initialized');
    }

    public async unlock(): Promise<void> {
        await this.#contextManager.resume();
    }

    public play(soundId: string, options?: IPlayOptions): number | number[] | null {
        return this.#router.play(soundId, options);
    }

    public stop(playbackIdOrSoundId: number | number[] | string): void {
        this.#router.stop(playbackIdOrSoundId);
    }

    public async showDebugUI(options?: DebuggerOptions): Promise<void> {
        const { default: AudioDebugger } = await import('./Debug/AudioDebugger');
        const debuggerInstance = new AudioDebugger(
            this.#contextManager.context,
            this.#busSystem,
            this.#busSystem.getMasterNode()
        );
        debuggerInstance.init(options);
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    public get _debug() {
        return {
            config: this.config,
            busSystem: this.#busSystem,
            masterOutput: this.#masterOutput,
            rtpcManager: this.#rtpcManager,
            router: this.#router,
            contextManager: this.#contextManager
        };
    }

    private async loadSounds(manifest: Record<string, any>, loader: AudioBufferLoader, registry: SoundRegistry) {
        for (const [key, entry] of Object.entries(manifest)) {
            const buffer = await loader.load(entry.url);
            registry.register(key, { buffer, options: { url: entry.url, hasPanner: entry.hasPanner } });
        }
    }
}
