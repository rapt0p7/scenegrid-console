// noinspection D

import SoundRegistry from '@domain/Configuration/SoundRegistry.js';
import { VoiceCullingArbiter } from '@domain/Culling/VoiceCullingArbiter.js';
import { EngineEventDispatcher } from '@domain/Events/EngineEventDispatcher.js';
import ContainerManager from '@domain/Managers/ContainerManager.js';
import DuckingManager from '@domain/Managers/DuckingManager.js';
import {
    MixerCoordinator,
    MixerLayerStack,
    MixerSnapshotManager,
    MixerStateManager,
    MixerStateResolver,
    PRIORITY
} from '@domain/Mixer/index.js';
import Sequencer from '@domain/Orchestration/Sequencer.js';
import AudioRouter from '@domain/Router/AudioRouter.js';
import ConsistencyChecker from '@domain/Validation/ConsistencyChecker.js';
import {
    AudioBufferLoader,
    AudioBusSystem,
    AudioContextManager,
    AudioNodeFactory,
    AutomationEngine,
    CullingContextProvider,
    CullingRunner,
    EngineTicker,
    FiltersPlugin,
    MasterOutput,
    PlaybackScheduler,
    SidechainDucker,
    SoundController,
    SoundInstance,
    SoundPoolManager,
    TinyLimiterNode
} from '@infrastructure';
import RTPCManager from '@kernel/RTPC/RTPCManager.js';
import deepFreeze from '@shared/deepFreeze.js';
import { isDefined } from '@shared/guards.js';

import type { IAudioEngineConfig } from '@application/Ports/IAudioEngineConfig.js';
import type { IPlayOptions } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest';
import type { AudioEngineEvents } from '@domain/Events/Ports/IEngineEvents.js';
import type { ITransitionToParameters } from '@domain/Orchestration/Ports/ISequencer.js';
import type { PlaybackId, SoundId } from '@domain/Types/Branded.js';
import type { IPluginFactory, DebuggerOptions } from '@infrastructure';
import type { IRTPCManifest } from '@kernel/RTPC/Ports/IRTPCManifest.js';
import type { Handler } from 'mitt';

export interface InitParameters {
    isStrictValidation?: boolean;
}

export class AudioEngine {
    #contextManager!: AudioContextManager;
    #engineTicker!: EngineTicker;
    #router!: AudioRouter;
    #busSystem!: AudioBusSystem;
    #soundController!: SoundController;
    #rtpcManager!: RTPCManager;
    #snapshotManager!: MixerSnapshotManager;
    #sequencer!: Sequencer;
    #cullingRunner!: CullingRunner;
    #masterOutput!: MasterOutput;
    #dispatcher: EngineEventDispatcher = new EngineEventDispatcher();
    #isInitialized = false;

    public readonly events = {
        on: <K extends keyof AudioEngineEvents>(type: K, handler: Handler<AudioEngineEvents[K]>) =>
            this.#dispatcher.on(type, handler),
        off: <K extends keyof AudioEngineEvents>(type: K, handler?: Handler<AudioEngineEvents[K]>) =>
            this.#dispatcher.off(type, handler),
        once: <K extends keyof AudioEngineEvents>(type: K, handler: Handler<AudioEngineEvents[K]>) =>
            this.#dispatcher.once(type, handler),
        clear: () => this.#dispatcher.clear()
    };

    public readonly params = {
        set: (parameterName: string, value: number) => this.#rtpcManager.setValue(parameterName, value),
        get: (parameterName: string) => this.#rtpcManager.getValue(parameterName)
    };

    public readonly mixer = {
        setState: (snapshotName: string) =>
            this.#snapshotManager.activateSnapshot(snapshotName, 'scene_main', PRIORITY.BASE),
        addModifier: (snapshotName: string, id: string, priority = PRIORITY.OVERLAY) =>
            this.#snapshotManager.activateSnapshot(snapshotName, id, priority),

        removeModifier: (id: string) => this.#snapshotManager.clearLayer(id)
    };

    public readonly music = {
        playLoop: (soundId: string, region: string) => this.#sequencer.playLoop(soundId as SoundId, region),
        stopLoop: (soundId: string) => this.#sequencer.stopLoop(soundId as SoundId),
        transitionTo: (options: ITransitionToParameters) => this.#sequencer.transitionTo(options)
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
            playbackId: PlaybackId | PlaybackId[];
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

    public async init(parameters?: InitParameters): Promise<void> {
        if (this.#isInitialized) return;

        const isConfigValid = ConsistencyChecker.validate(this.config);
        if (!isConfigValid) {
            if (parameters?.isStrictValidation) {
                this.#dispatcher.emit('engine:error', { code: 'INIT_FAILED', message: 'Strict validation failed' });
                console.error(
                    '[AudioEngine] Engine initialized with errors. Some features may not work correctly. Exiting.'
                );
                return;
            }
            console.warn('[AudioEngine] Engine initialized with errors. Some features may not work correctly.');
        }

        try {
            this.#contextManager = new AudioContextManager(44_100);

            this.#contextManager.onStateChange = state => {
                if (state === 'suspended') this.#dispatcher.emit('state:suspended', void 0);
                if (state === 'running') this.#dispatcher.emit('state:resumed', void 0);
            };

            this.#engineTicker = new EngineTicker(() => this.#contextManager.currentTime);
            this.#engineTicker.start();

            const automation = new AutomationEngine(this.#contextManager.context, this.#engineTicker);
            this.#contextManager.initSpatial(automation);
            const nodeFactory = new AudioNodeFactory(this.#contextManager);
            const scheduler = new PlaybackScheduler(this.#contextManager);
            const bufferLoader = new AudioBufferLoader(this.#contextManager);
            this.#masterOutput = new MasterOutput(this.#contextManager, automation);
            this.#rtpcManager = new RTPCManager();

            if (this.config.rtpcManifest) this.initRTPC(this.config.rtpcManifest);

            const soundRegistry = new SoundRegistry();
            await this.loadSounds(this.config.manifest, bufferLoader, soundRegistry);

            const instanceFactory = (soundId: SoundId): SoundInstance => {
                if (soundId === ('__RESERVED__' as SoundId)) {
                    return new SoundInstance(soundId, this.#contextManager, nodeFactory, null, automation, {});
                }

                const { buffer, options } = soundRegistry.get(soundId);
                const soundConfig = this.config.soundMap[soundId] as any;

                const instanceOptions = {
                    ...options,
                    spatial: soundConfig?.spatial,
                    hasPanner: soundConfig?.hasPanner
                };

                return new SoundInstance(
                    soundId,
                    this.#contextManager,
                    nodeFactory,
                    buffer,
                    automation,
                    instanceOptions
                );
            };

            const soundPool = new SoundPoolManager(instanceFactory, {
                globalVoiceLimit: this.config.globalVoiceLimit ?? 32,
                voiceConfigResolver: (soundId: SoundId) => {
                    const cfg = this.config.soundMap[soundId];
                    return cfg && 'voice' in cfg ? cfg.voice : undefined;
                }
            });

            const pluginFactory: IPluginFactory = {
                createLimiter: () =>
                    new TinyLimiterNode(this.#contextManager.context, {
                        lookahead: 0.008,
                        ceiling: 0.98,
                        release: 0.12
                    }),
                createSidechain: (target, options) =>
                    new SidechainDucker({
                        ctx: this.#contextManager.context,
                        targetGainNode: target,
                        ...options
                    }),
                getFiltersPlugin: () => FiltersPlugin
            };

            this.#busSystem = new AudioBusSystem(
                {
                    context: this.#contextManager.context,
                    automation,
                    masterOutput: this.#masterOutput as any,
                    busConfig: this.config.buses,
                    pluginFactory
                },
                { isUseLimiter: true }
            );
            await this.#busSystem.initialize(this.#engineTicker);

            this.#soundController = new SoundController(
                soundPool,
                scheduler,
                this.#contextManager.context,
                automation,
                soundRegistry.registry,
                this.#busSystem
            );

            const duckingManager = new DuckingManager(this.#busSystem, this.#soundController);
            const containerManager = new ContainerManager();

            this.#router = new AudioRouter({
                soundController: this.#soundController,
                busSystem: this.#busSystem,
                duckingManager,
                rtpcManager: this.#rtpcManager,
                containerManager,
                soundMap: this.config.soundMap
            });

            this.#sequencer = new Sequencer(this.#soundController, this.#router, this.#engineTicker);

            const resolver = new MixerStateResolver({ defaultBusGain: 1 });

            const layerStack = new MixerLayerStack(resolver, async () => {
                await coordinator.recompute({ durationMs: 500 });
            });

            const mixerStateManager = new MixerStateManager(this.#busSystem, this.#rtpcManager);
            const coordinator = new MixerCoordinator(layerStack, mixerStateManager);
            this.#snapshotManager = new MixerSnapshotManager(layerStack, this.config.snapshots, coordinator);

            const cullingArbiter = new VoiceCullingArbiter(0.01);

            const cullingProvider = new CullingContextProvider(
                this.#soundController,
                this.#busSystem,
                this.config.soundMap
            );

            this.#cullingRunner = new CullingRunner(cullingArbiter, this.#soundController, cullingProvider);

            this.#engineTicker.add('rtpc-manager', RTPCManager.TICK_RATE_MS, (_, deltaTimeMs) =>
                this.#rtpcManager.tick(deltaTimeMs)
            );
            this.#engineTicker.add('culling-runner', CullingRunner.TICK_RATE_MS, () => this.#cullingRunner.tick());
            mixerStateManager.events.on('transition:start', () => this.#cullingRunner.tick());
            this.#engineTicker.add('mixer-state-manager', MixerStateManager.TICK_RATE_MS, (_, deltaTimeMs) =>
                mixerStateManager.update(deltaTimeMs)
            );

            this.#isInitialized = true;

            this.#dispatcher.emit('engine:ready', {
                timestamp: performance.now(),
                sampleRate: this.#contextManager.context.sampleRate
            });
            console.log('[AudioEngine] Successfully Initialized');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.#dispatcher.emit('engine:error', { code: 'INIT_FAILED', message, details: error });
            throw error;
        }
    }

    public async unlock(): Promise<void> {
        await this.#contextManager.resume();
    }

    public async suspend(): Promise<void> {
        await this.#contextManager.suspend();
    }

    public play(soundId: string, options?: IPlayOptions): PlaybackId | PlaybackId[] | null {
        return this.#router.play(soundId as SoundId, options);
    }

    public stop(playbackIdOrSoundId: PlaybackId | PlaybackId[] | string): void {
        this.#router.stop(playbackIdOrSoundId as PlaybackId | PlaybackId[] | SoundId);
    }

    public async showDebugUI(options?: DebuggerOptions): Promise<void> {
        const { default: AudioDebugger } = await import('@infrastructure/debug/AudioDebugger.js');
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
            contextManager: this.#contextManager,
            snapshotManager: this.#snapshotManager,
            poolManager: this.#soundController.debugPool,
            layerStack: this.#snapshotManager.debugLayerStack
        };
    }

    private initRTPC(rtpcManifest: IRTPCManifest): void {
        for (const [parameterName, config] of Object.entries(rtpcManifest)) {
            if (isDefined(config.defaultValue)) {
                this.#rtpcManager.setValue(parameterName, config.defaultValue);
            }

            this.#rtpcManager.configureParam(parameterName, config.attackMs ?? 0, config.releaseMs ?? 0);
        }
    }

    private async loadSounds(
        manifest: ISpriteSoundManifest,
        loader: AudioBufferLoader,
        registry: SoundRegistry
    ): Promise<void> {
        const entries = Object.entries(manifest);
        const totalItems = entries.length;

        if (totalItems === 0) {
            this.#dispatcher.emit('load:complete', { failedItems: [], durationMs: 0 });
            return;
        }

        this.#dispatcher.emit('load:start', { totalItems });
        const startTime = performance.now();
        const failedItems: string[] = [];

        const urls = Object.fromEntries(entries.map(([k, v]) => [k, v.url]));

        const buffers = await loader.loadBatch(
            urls,
            (loaded, total, lastKey) => {
                this.#dispatcher.emit('load:progress', {
                    loadedItems: loaded,
                    totalItems: total,
                    progress: loaded / total,
                    lastLoadedResource: lastKey
                });
            },
            (key, error) => {
                failedItems.push(key);

                this.#dispatcher.emit('engine:error', {
                    code: 'DECODE_ERROR',
                    message: `Failed to load resource: ${key}`,
                    details: error
                });
            }
        );

        for (const [key, entry] of entries) {
            const buffer = buffers[key];

            if (isDefined(buffer)) {
                registry.register(key, {
                    buffer,
                    options: { url: entry.url }
                });
            }
        }

        this.#dispatcher.emit('load:complete', {
            failedItems,
            durationMs: performance.now() - startTime
        });
    }
}
