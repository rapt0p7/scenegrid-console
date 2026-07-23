// noinspection D

import SoundRegistry from '@domain/Configuration/SoundRegistry.js';
import { VoiceCullingArbiter } from '@domain/Culling/VoiceCullingArbiter.js';
import { EngineEventDispatcher } from '@domain/Events/EngineEventDispatcher.js';
import ContainerPlaybackPolicy from '@domain/Managers/ContainerPlaybackPolicy.js';
import DuckingManager from '@domain/Managers/DuckingManager.js';
import {
    MixerCoordinator,
    MixerLayerStack,
    MixerSnapshotManager,
    MixerStateResolver,
    MixerTransitionEngine,
    PRIORITY
} from '@domain/Mixer/index.js';
import Sequencer from '@domain/Orchestration/Sequencer.js';
import AudioRouter from '@domain/Router/AudioRouter.js';
import ConsistencyChecker from '@domain/Validation/ConsistencyChecker.js';
import { ConsoleReporter } from '@domain/Validation/Reporters/ConsoleReporter.js';
import { TelemetryConsistencyReporter } from '@domain/Validation/Reporters/TelemetryConsistencyReporter.js';
import {
    AudioBufferLoader,
    AudioBusSystem,
    AudioContextManager,
    AudioNodeFactory,
    AutomationEngine,
    ContainerHistoryRegistry,
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
    TinyLimiterNode,
    BankManagerAdapter,
    SwitchHistoryRegistry,
    TelemetryDispatcher,
    BroadcastTelemetryTransport,
    TelemetrySnapshotter,
    CommandReceiver
} from '@infrastructure';
import type { IPluginFactory } from '@infrastructure';
import RTPCManager from '@kernel/RTPC/RTPCManager.js';
import { SeededPRNG, isDefined, deepFreeze, typedEntries, typedKeys, Milliseconds, Pulses } from '@scene-grid/shared';

import type { IAudioEngineConfig } from '@application/Ports/IAudioEngineConfig.js';
import type { IPlayOptions } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { AudioEngineEvents } from '@domain/Events/Ports/IEngineEvents.js';
import type { ITransitionToParameters } from '@domain/Orchestration/Ports/ISequencer.js';
import type {
    BankId,
    EventId,
    GameParamId,
    LayerId,
    PlaybackId,
    RegionId,
    SnapshotId,
    SoundId,
    BusId,
    TickerTaskId,
    DeepReadonly,
    QuantizeType
} from '@scene-grid/shared';
import type { IRTPCManifest } from '@kernel/RTPC/Ports/IRTPCManifest.js';
import type { Handler } from 'mitt';
import { InstanceRTPCBinder } from '@domain/Managers/InstanceRTPCBinder.js';
import SwitchPlaybackPolicy from '@domain/Managers/SwitchPlaybackPolicy.js';
import { AudioEventOrchestrator } from '@domain/Orchestration/AudioEventOrchestrator.js';
import SmartLoopTransitionPolicy from '@domain/Orchestration/SmartLoopTransitionPolicy.js';
import { ScattererOrchestrator } from '@domain/Orchestration/ScattererOrchestrator.js';
import { MusicConductor } from '@domain/Orchestration/MusicConductor.js';
import type { IAudioEngine, InitParameters } from '@application/Ports/IAudioEngine.js';
import type { BankState } from '@domain/Configuration/Ports/IBankConfig.js';
import type { IConsistencyReporter } from '@domain/Validation/Ports/IConsistencyReporter.js';
import type { IInspectorDebugPort } from '@domain/Shared/Ports/IInspectorDebugPort.js';
import type {
    AutocompleteBank,
    AutocompleteEvent,
    AutocompleteGameParam,
    AutocompleteSnapshot,
    AutocompleteSound
} from '@application/Ports/SceneGridRegistry.js';

export class AudioEngine implements IAudioEngine {
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
    #instanceRTPCBinder!: InstanceRTPCBinder;
    #eventOrchestrator!: AudioEventOrchestrator;
    #scattererOrchestrator!: ScattererOrchestrator;
    #conductor?: MusicConductor;
    #prng!: SeededPRNG;
    #bankManager!: BankManagerAdapter;
    #telemetry!: TelemetryDispatcher;
    #reporters!: IConsistencyReporter[];
    #isInitialized = false;

    public readonly events = {
        on: <K extends keyof AudioEngineEvents>(type: K, handler: Handler<AudioEngineEvents[K]>) => {
            this.#dispatcher.on(type, handler);
        },
        off: <K extends keyof AudioEngineEvents>(type: K, handler?: Handler<AudioEngineEvents[K]>) => {
            this.#dispatcher.off(type, handler);
        },
        once: <K extends keyof AudioEngineEvents>(type: K, handler: Handler<AudioEngineEvents[K]>) => {
            this.#dispatcher.once(type, handler);
        },
        clear: () => {
            this.#dispatcher.clear();
        }
    };

    public readonly params = {
        set: (parameterName: AutocompleteGameParam, value: number) => {
            this.#rtpcManager.setValue(parameterName as GameParamId, value);
        },
        get: (parameterName: AutocompleteGameParam) => this.#rtpcManager.getValue(parameterName as GameParamId)
    };

    public readonly mixer = {
        setState: (snapshotName: AutocompleteSnapshot, duration?: number) => {
            this.#snapshotManager.activateSnapshot(
                snapshotName as SnapshotId,
                'scene_main' as LayerId,
                PRIORITY.BASE,
                duration as Milliseconds
            );
        },
        addModifier: (snapshotName: AutocompleteSnapshot, id: string, priority = PRIORITY.OVERLAY) => {
            this.#snapshotManager.activateSnapshot(snapshotName as SnapshotId, id as LayerId, priority);
        },

        removeModifier: (id: string) => {
            this.#snapshotManager.clearLayer(id as LayerId);
        }
    };

    public readonly music = {
        playLoop: (soundId: AutocompleteSound, region: string) => {
            this.#sequencer.playLoop(soundId as SoundId, region as RegionId);
        },
        stopLoop: (soundId: AutocompleteSound) => {
            this.#sequencer.stopLoop(soundId as SoundId);
        },
        playStinger: (
            stingerId: AutocompleteSound,
            quantize: QuantizeType,
            referenceTrackId?: AutocompleteSound
        ): void => {
            this.#sequencer.playStinger(stingerId as SoundId, quantize, referenceTrackId as SoundId);
        },
        transitionTo: (options: ITransitionToParameters) => {
            this.#sequencer.transitionTo(options);
        }
    };

    public readonly conductor = {
        start: (): void => {
            this.#conductor?.start();
        }
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
        }: DeepReadonly<{
            fx: number;
            fy: number;
            fz: number;
            ux: number;
            uy: number;
            uz: number;
        }>) => {
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

    public get banks() {
        return {
            load: async (bankId: AutocompleteBank): Promise<void> => {
                if (!this.#isInitialized) return;
                await this.#bankManager.loadBank(bankId as BankId);
            },
            unload: (bankId: AutocompleteBank): void => {
                if (!this.#isInitialized) return;
                this.#bankManager.unloadBank(bankId as BankId);
            },
            getState: (bankId: AutocompleteBank): BankState => {
                if (!this.#isInitialized) return 'UNLOADED';
                return this.#bankManager.getBankState(bankId as BankId);
            }
        };
    }

    public readonly config: Readonly<IAudioEngineConfig>;

    constructor(config: IAudioEngineConfig) {
        this.config = deepFreeze<IAudioEngineConfig>({ ...config });
    }

    // oxlint-disable-next-line max-lines-per-function
    public async init(parameters?: InitParameters): Promise<void> {
        if (this.#isInitialized) return;

        const transport = new BroadcastTelemetryTransport();
        this.#telemetry = new TelemetryDispatcher(transport);
        this.#reporters = [new ConsoleReporter(), new TelemetryConsistencyReporter(this.#telemetry)];

        const isConfigValid = ConsistencyChecker.validate(this.config, {
            reporters: this.#reporters
        });
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

            const seed = this.config.seed ?? Date.now();
            this.#prng = new SeededPRNG(seed);
            const automation = new AutomationEngine(this.#contextManager.context, this.#engineTicker);
            this.#contextManager.initSpatial(automation);
            const nodeFactory = new AudioNodeFactory(this.#contextManager);
            const scheduler = new PlaybackScheduler(this.#contextManager);
            const bufferLoader = new AudioBufferLoader(this.#contextManager);
            this.#masterOutput = new MasterOutput(this.#contextManager, automation);
            this.#rtpcManager = new RTPCManager();

            if (this.config.rtpcManifest) this.initRTPC(this.config.rtpcManifest);

            const soundRegistry = new SoundRegistry();
            for (const [key, entry] of typedEntries(this.config.manifest)) {
                soundRegistry.register(key, {
                    options: { url: entry.url }
                });
            }

            const instanceFactory = (soundId: SoundId): SoundInstance => {
                if (soundId === ('__RESERVED__' as SoundId)) {
                    return new SoundInstance(soundId, this.#contextManager, nodeFactory, null, automation, {});
                }

                const { options } = soundRegistry.get(soundId);
                const soundConfig = this.config.soundMap[soundId] as any;

                const buffer = bufferLoader.getBuffer(options.url);

                if (!buffer) {
                    console.warn(
                        `[AudioEngine] Buffer for "${soundId}" not found. Ensure the corresponding bank is loaded.`
                    );
                    return new SoundInstance(
                        '__RESERVED__' as SoundId,
                        this.#contextManager,
                        nodeFactory,
                        null,
                        automation,
                        {}
                    );
                }

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
                    return isDefined(cfg) && 'voice' in cfg ? cfg.voice : undefined;
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
                this.#busSystem,
                (url: string | string[]) => bufferLoader.getBuffer(url),
                this.#telemetry
            );

            this.#instanceRTPCBinder = new InstanceRTPCBinder(this.#rtpcManager, this.#soundController);

            const duckingManager = new DuckingManager(this.#busSystem, this.#soundController);
            const containerHistoryRegistry = new ContainerHistoryRegistry();
            const containerPolicy = new ContainerPlaybackPolicy(this.#prng);
            const switchPolicy = new SwitchPlaybackPolicy();
            const switchHistoryRegistry = new SwitchHistoryRegistry();

            this.#router = new AudioRouter({
                soundController: this.#soundController,
                duckingManager,
                containerPolicy,
                historyRegistry: containerHistoryRegistry,
                soundMap: this.config.soundMap,
                instanceRTPCBinder: this.#instanceRTPCBinder,
                rtpcAdapter: this.#rtpcManager,
                switchPolicy,
                switchHistoryRegistry,
                prng: this.#prng,
                telemetry: this.#telemetry
            });

            const smartLoopTransitionPolicy = new SmartLoopTransitionPolicy(this.#rtpcManager);
            this.#sequencer = new Sequencer(
                this.#soundController,
                this.#router,
                this.#engineTicker,
                smartLoopTransitionPolicy,
                this.config.sequencer?.ppqn as Pulses,
                this.#telemetry
            );

            const resolver = new MixerStateResolver({ defaultBusGain: 1 });

            const layerStack = new MixerLayerStack(resolver, () => {
                coordinator.recompute({ duration: 500 as Milliseconds });
            });

            const mixerTransitionEngine = new MixerTransitionEngine(this.#busSystem, this.#rtpcManager);
            const coordinator = new MixerCoordinator(layerStack, mixerTransitionEngine);
            this.#snapshotManager = new MixerSnapshotManager(
                layerStack,
                this.config.snapshots,
                coordinator,
                this.#telemetry,
                this.#soundController
            );

            this.#bankManager = new BankManagerAdapter(
                this.config.banks,
                this.config.manifest,
                bufferLoader,
                soundPool,
                this.#router,
                {
                    onStart: totalItems => {
                        this.#dispatcher.emit('load:start', { totalItems });
                    },
                    onProgress: (loadedItems, totalItems, progress, lastLoadedResource) => {
                        this.#dispatcher.emit('load:progress', {
                            loadedItems,
                            totalItems,
                            progress,
                            lastLoadedResource
                        });
                    },
                    onError: (key, error) => {
                        this.#dispatcher.emit('engine:error', {
                            code: 'DECODE_ERROR',
                            message: `Failed to load resource: ${key}`,
                            details: error
                        });
                    },
                    onComplete: (failedItems, durationMs) => {
                        this.#dispatcher.emit('load:complete', { failedItems, durationMs });
                    },
                    onUnload: bankId => {
                        this.#dispatcher.emit('unload:complete', { bankId });
                    }
                }
            );

            this.#eventOrchestrator = new AudioEventOrchestrator(
                this.config.events,
                this.#router,
                this.#rtpcManager,
                this.#sequencer,
                this.#snapshotManager,
                this.#soundController,
                this.#prng,
                this.#bankManager
            );

            this.#scattererOrchestrator = new ScattererOrchestrator(
                this.#router,
                this.#soundController,
                this.#sequencer,
                containerPolicy,
                this.#prng
            );
            this.#router.setScattererOrchestrator(this.#scattererOrchestrator);

            if (this.config.musicFSM) {
                this.#conductor = new MusicConductor(this.#sequencer, this.#snapshotManager, this.#rtpcManager);
                this.#conductor.init(this.config.musicFSM);
            }

            const snapshotter = new TelemetrySnapshotter(
                this.#telemetry,
                this.#soundController,
                this.#rtpcManager,
                this.#busSystem,
                switchHistoryRegistry,
                this.#sequencer,
                typedKeys(this.config.rtpcManifest ?? {}),
                typedKeys(this.config.soundMap).filter(k => 'isSwitch' in this.config.soundMap[k]),
                typedKeys(this.config.buses) as BusId[],
                this.config.globalVoiceLimit ?? 128
            );

            const cullingArbiter = new VoiceCullingArbiter(0.01, 1000 as Milliseconds, this.config.globalVoiceLimit);

            const cullingProvider = new CullingContextProvider(
                this.#soundController,
                this.#busSystem,
                this.config.soundMap
            );

            this.#cullingRunner = new CullingRunner(
                cullingArbiter,
                this.#soundController,
                cullingProvider,
                this.#telemetry
            );

            this.#engineTicker.add('telemetry' as TickerTaskId, this.#telemetry.TICK_RATE, this.#telemetry);

            this.#engineTicker.add('snapshotter' as TickerTaskId, snapshotter.TICK_RATE, snapshotter);

            this.#engineTicker.add('rtpc-manager' as TickerTaskId, RTPCManager.TICK_RATE, this.#rtpcManager);

            this.#engineTicker.add('bus-system' as TickerTaskId, RTPCManager.TICK_RATE, {
                tick: () => {
                    this.#busSystem.tickRTPC(this.#rtpcManager);
                }
            });

            this.#engineTicker.add('instance-rtpc' as TickerTaskId, RTPCManager.TICK_RATE, {
                tick: () => {
                    this.#instanceRTPCBinder.tickRTPC();
                }
            });

            this.#engineTicker.add(
                'sound-controller' as TickerTaskId,
                SoundController.TICK_RATE,
                this.#soundController
            );
            this.#engineTicker.add('culling-runner' as TickerTaskId, CullingRunner.TICK_RATE, this.#cullingRunner);
            mixerTransitionEngine.events.on('transition:start', () => {
                this.#cullingRunner.tick(this.#contextManager.currentTime, 0 as Milliseconds);
            });
            this.#engineTicker.add(
                'mixer-state-manager' as TickerTaskId,
                MixerTransitionEngine.TICK_RATE,
                mixerTransitionEngine
            );

            this.#engineTicker.add(
                'scatterer-orchestrator' as TickerTaskId,
                this.#scattererOrchestrator.TICK_RATE,
                this.#scattererOrchestrator
            );

            if (this.#conductor) {
                this.#engineTicker.add('music-conductor' as TickerTaskId, this.#conductor.TICK_RATE, this.#conductor);
            }

            this.#isInitialized = true;

            this.#telemetry.dispatchManifest(this.config);

            if (process.env.NODE_ENV !== 'production') {
                const debugPort: IInspectorDebugPort = {
                    fireEvent: eventId => {
                        this.#eventOrchestrator.postEvent(eventId);
                    },
                    applySnapshot: (snapshotId, fade) => {
                        this.#snapshotManager.activateSnapshot(
                            snapshotId,
                            'scene_main' as LayerId,
                            PRIORITY.BASE,
                            fade
                        );
                    },
                    setRtpcOverride: (param, val, isOverride) => {
                        this.#rtpcManager.setOverride(param, val, isOverride);
                    },
                    setSwitchOverride: (switchId, key, isOverride) => {
                        switchHistoryRegistry.setOverride(switchId, key, isOverride);
                    },
                    stopAll: () => {
                        this.#soundController.stopAll();
                    },
                    pauseAll: () => {
                        this.#soundController.pauseAll();
                    },
                    resumeAll: () => {
                        this.#soundController.resumeAll();
                    },
                    clearAllOverrides: () => {
                        this.#rtpcManager.resetOverrides();
                        switchHistoryRegistry.resetOverrides();
                    },
                    playLoop: (soundId, region) => {
                        this.#sequencer.playLoop(soundId, region);
                    },
                    stopLoop: soundId => {
                        this.#sequencer.stopLoop(soundId);
                    },
                    transitionMusicTo: (soundId, targetRegion, transitionRegionName, options) => {
                        this.#sequencer.transitionTo({
                            soundId,
                            targetRegion,
                            transitionRegionName,
                            options
                        });
                    }
                };

                const receiver = new CommandReceiver(debugPort);

                this.#engineTicker.add(
                    'inspector-command-receiver' as TickerTaskId,
                    CommandReceiver.TICK_RATE,
                    receiver
                );
            }

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

    public play(soundId: AutocompleteSound, options?: DeepReadonly<IPlayOptions>): PlaybackId | PlaybackId[] | null {
        return this.#router.play(soundId as SoundId, options);
    }

    public stop(playbackIdOrSoundId: PlaybackId | PlaybackId[] | AutocompleteSound): void {
        this.#router.stop(playbackIdOrSoundId as PlaybackId | PlaybackId[] | SoundId);
    }

    public pause(playbackIdOrSoundId: PlaybackId | PlaybackId[] | AutocompleteSound): void {
        this.#router.pause(playbackIdOrSoundId as PlaybackId | PlaybackId[] | SoundId);
    }

    public resume(playbackIdOrSoundId: PlaybackId | PlaybackId[] | AutocompleteSound): void {
        this.#router.resume(playbackIdOrSoundId as PlaybackId | PlaybackId[] | SoundId);
    }

    public postEvent(eventId: AutocompleteEvent): void {
        if (!this.#isInitialized) {
            console.warn(`[AudioEngine] Cannot post event "${eventId}": Engine is not initialized.`);
            return;
        }
        this.#eventOrchestrator.postEvent(eventId as EventId);
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
            layerStack: this.#snapshotManager.debugLayerStack,
            eventOrchestrator: this.#eventOrchestrator
        };
    }

    /**
     * @internal Hot Module Replacement API
     * Soft-reloads the engine configuration without stopping the audio context.
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public async _hotReloadConfig(newConfig: DeepReadonly<IAudioEngineConfig>): Promise<void> {
        if (!this.#isInitialized) return;

        console.log('[AudioEngine] 🔥 Initiating Hot Reload...');

        const isValid = ConsistencyChecker.validate(newConfig, {
            reporters: this.#reporters
        });
        if (!isValid) {
            console.error('[AudioEngine] 🔥 Hot Reload aborted: Config validation failed.');
            return;
        }

        try {
            (this as any).config = deepFreeze({ ...newConfig });

            if (newConfig.rtpcManifest) {
                this.initRTPC(newConfig.rtpcManifest);
            }

            await this.#busSystem.updateConfig(newConfig.buses);

            this.#snapshotManager.updateSnapshotsConfig(newConfig.snapshots);
            (this.#router as any).soundMap = newConfig.soundMap;

            console.log('[AudioEngine] 🔥 Hot Reload complete!');
        } catch (error) {
            console.error('[AudioEngine] 🔥 Hot Reload failed during apply phase.', error);
        }
    }

    private initRTPC(rtpcManifest: DeepReadonly<IRTPCManifest>): void {
        for (const [parameterName, config] of Object.entries(rtpcManifest)) {
            if (isDefined(config.defaultValue)) {
                this.#rtpcManager.setValue(parameterName as GameParamId, config.defaultValue);
            }

            this.#rtpcManager.configureParam(
                parameterName as GameParamId,
                config.attack ?? (0 as Milliseconds),
                config.release ?? (0 as Milliseconds)
            );
        }
    }
}
