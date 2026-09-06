// oxlint-disable no-underscore-dangle
// noinspection D

import type { IStreamManifest } from '@domain/Configuration/Ports/IStreamManifest.js';
import type { IControllerPlayOptions, ISoundController, VirtualReason } from '@domain/Shared/Ports/ISoundController.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type AudioBusSystem from '@infrastructure/busSystem/AudioBusSystem.js';
import type SoundPoolManager from '@infrastructure/instance/SoundPoolManager.js';
import type { PlaybackScheduler } from '@infrastructure/scheduling/PlaybackScheduler.js';
import type { AudioCtx } from '@infrastructure/types/IAudioContext.js';
import type { ILogicalVoice } from '@infrastructure/types/ILogicalVoice.js';
import type { ISoundOptions } from '@infrastructure/types/ISoundOptions.js';
import type {
    BusId,
    PlaybackId,
    SoundId,
    LifecycleAction,
    ITelemetryLifecycleEvent,
    ContextTime,
    Seconds,
    Milliseconds
} from '@scene-grid/shared';

import { CyclePool } from '@scene-grid/shared';

export interface SoundDescriptor {
    readonly options: ISoundOptions;
}

const DEFAULT_COOLDOWN = 15 as Milliseconds;

interface VirtualVoiceTimer {
    playbackId: PlaybackId;
    endTime: ContextTime;
}

export class SoundController implements ISoundController {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static TICK_DIVIDER: number = 1;
    public readonly activeVoices = new Map<PlaybackId, ILogicalVoice>();

    private readonly lastPlayTimes = new Map<SoundId, Milliseconds>();
    private nextPlaybackId = 1 as PlaybackId;
    readonly #sidechainLinks: Array<Map<BusId, number>>;
    private readonly virtualTimers: VirtualVoiceTimer[] = [];
    private readonly lifecyclePool = new CyclePool<ITelemetryLifecycleEvent>(128, () => ({
        type: 'LIFECYCLE',
        timestampMs: 0,
        action: 'START',
        playbackId: 0 as PlaybackId,
        soundId: '' as SoundId,
        reason: undefined
    }));

    constructor(
        private readonly pool: SoundPoolManager,
        private readonly scheduler: PlaybackScheduler,
        private readonly context: AudioCtx,
        private readonly automation: AutomationEngine,
        private readonly registry: Map<SoundId, SoundDescriptor>,
        private readonly busSystem: AudioBusSystem,
        private readonly bufferResolver: (url: string | string[]) => AudioBuffer | undefined,
        private readonly manifestResolver: (url: string | string[]) => IStreamManifest | undefined,
        private readonly streamFactory: (manifest: IStreamManifest) => any,
        private readonly telemetry?: ITelemetryDispatcher
    ) {
        this.#sidechainLinks = Array.from({ length: pool.globalVoiceLimit }, () => new Map<BusId, number>());
        this.pool.events.on('released', this.#handleInstanceReleased);
    }

    public tick(): void {
        const currentTime = this.context.currentTime as ContextTime;
        const timers = this.virtualTimers;

        for (let index = timers.length - 1; index >= 0; index--) {
            if (currentTime >= timers[index].endTime) {
                const id = timers[index].playbackId;

                timers[index] = timers[timers.length - 1];
                timers.pop();

                const voice = this.activeVoices.get(id);
                if (voice?.physicalInstance && 'forceNaturalEnd' in voice.physicalInstance) {
                    voice.physicalInstance.forceNaturalEnd();
                }
            }
        }
    }

    // oxlint-disable-next-line unicorn/no-object-as-default-parameter
    register(soundId: SoundId, options: ISoundOptions = { url: '' }): void {
        if (this.registry.has(soundId)) return;
        this.registry.set(soundId, { options });
    }

    unregister(soundId: SoundId): void {
        this.registry.delete(soundId);
        this.pool.dispose(soundId);
        this.lastPlayTimes.delete(soundId);
    }

    // oxlint-disable-next-line max-lines-per-function
    public play(
        soundId: SoundId,
        {
            when = 0 as ContextTime,
            offset = 0 as Seconds,
            duration,
            loop = false,
            rate = 1,
            onRevive
        }: IControllerPlayOptions
    ): PlaybackId | null {
        const definition = this.registry.get(soundId);
        if (!definition) return null;

        const now = (this.getCurrentTime() * 1000) as Milliseconds;
        const lastPlay = this.lastPlayTimes.get(soundId) ?? (-Number.MAX_SAFE_INTEGER as Milliseconds);
        const cooldownMs = (definition.options.cooldownMs ?? DEFAULT_COOLDOWN) as Milliseconds;

        if (now - lastPlay < cooldownMs) {
            return null;
        }

        this.lastPlayTimes.set(soundId, now);

        let instance: any;

        const manifest = this.manifestResolver(definition.options.url);

        if (manifest) {
            instance = this.streamFactory(manifest);
            instance._poolIndex = -1;
        } else {
            const buffer = this.bufferResolver(definition.options.url);
            if (!buffer) return null;

            const acquireResult = this.pool.acquire(soundId, buffer);

            if (typeof acquireResult === 'string') {
                this.telemetry?.dispatch({
                    type: 'CAUSE_CHAIN',
                    timestampMs: this.getCurrentTime() * 1000,
                    initiator: { type: 'API', method: 'controller.play' },
                    result: { type: 'BLOCKED', reason: `Pool rejected play for ${soundId}. Reason: ${acquireResult}` }
                });
                return null;
            }
            instance = acquireResult;
        }

        const playbackId = this.nextPlaybackId++ as PlaybackId;

        const logicalVoice: ILogicalVoice = {
            playbackId,
            soundId,
            logicalState: 'playing',
            position: { x: 0, y: 0, z: 0 },
            startedAtContextTime: this.context.currentTime as ContextTime,
            startOffset: (offset || 0) as Seconds,
            physicalInstance: instance,
            onRevive: onRevive
                ? () => {
                      onRevive(playbackId);
                  }
                : undefined
        };

        instance._currentPlaybackId = playbackId;

        this.activeVoices.set(playbackId, logicalVoice);

        instance.setLoop(loop);
        instance.setRate(rate);

        instance.on('ended', this.#handleVoiceEnded);

        this.scheduler.schedulePlay(instance, when, offset, duration ?? undefined);

        this.pushLifecycle('START', playbackId, soundId);

        return playbackId;
    }

    public setPosition(playbackId: PlaybackId, x: number, y: number, z: number): void {
        const voice = this.activeVoices.get(playbackId);
        if (!voice) return;

        voice.position.x = x;
        voice.position.y = y;
        voice.position.z = z;

        if (voice.physicalInstance) {
            voice.physicalInstance.setPosition(x, y, z);
        }
    }

    public getPosition(
        playbackId: PlaybackId
    ): { readonly x: number; readonly y: number; readonly z: number } | undefined {
        return this.activeVoices.get(playbackId)?.position;
    }

    public get debugPool(): SoundPoolManager {
        return this.pool;
    }

    public routeToBus(playbackId: PlaybackId, busId: BusId): void {
        const voice = this.getLogicalVoice(playbackId);
        const instance = voice?.physicalInstance;

        if (instance) {
            const bus = this.busSystem.getBus(busId);
            if (bus) {
                instance.connectTo(bus.inputNode);
            }
        }
    }

    public addSidechainTrigger(playbackId: PlaybackId, busId: BusId, intensity: number): void {
        const voice = this.getLogicalVoice(playbackId);
        const instance = voice?.physicalInstance;

        const triggerNode = instance?.sidechainTriggerNode;

        if (instance && triggerNode) {
            const poolIndex = (instance as any)._poolIndex;
            this.busSystem.addSidechainSource(triggerNode, busId, intensity);
            this.#sidechainLinks[poolIndex]?.set(busId, intensity);
        }
    }

    public removeSidechainTrigger(playbackId: PlaybackId, busId: BusId): void {
        const voice = this.getLogicalVoice(playbackId);
        const instance = voice?.physicalInstance;
        const triggerNode = instance?.sidechainTriggerNode;

        if (triggerNode) {
            const poolIndex = (instance as any)._poolIndex;
            this.busSystem.removeSidechainSource(triggerNode, busId);
            this.#sidechainLinks[poolIndex]?.delete(busId);
        }
    }

    getLogicalVoice(playbackId: PlaybackId): ILogicalVoice | undefined {
        return this.activeVoices.get(playbackId);
    }

    stopById(playbackId: PlaybackId, timeToStop?: ContextTime): void {
        const voice = this.activeVoices.get(playbackId);
        if (voice) {
            if (voice.physicalInstance) {
                voice.physicalInstance.stop(timeToStop);
            } else if ((voice as any).isVirtualNode) {
                this.activeVoices.delete(playbackId);
            }

            this.pushLifecycle('STOP', playbackId, voice.soundId, 'API_STOP');
        }
    }

    stopAll(soundId?: SoundId): void {
        if (soundId) {
            for (const [id, voice] of this.activeVoices.entries()) {
                if (voice.soundId === soundId) this.stopById(id);
            }
        } else {
            for (const id of this.activeVoices.keys()) this.stopById(id);
        }
    }

    pauseById(playbackId: PlaybackId): void {
        const voice = this.activeVoices.get(playbackId);
        if (voice) {
            voice.logicalState = 'paused';

            if (voice.physicalInstance) {
                this.#removeFromVirtualQueue(playbackId);
                if ('pause' in voice.physicalInstance) {
                    (voice.physicalInstance as any).pause();
                }
            }

            this.pushLifecycle('PAUSE', playbackId, voice.soundId);
        }
    }

    pauseAll(soundId?: SoundId): void {
        if (soundId) {
            for (const [id, voice] of this.activeVoices.entries()) {
                if (voice.soundId === soundId) this.pauseById(id);
            }
        } else {
            for (const id of this.activeVoices.keys()) this.pauseById(id);
        }
    }

    resumeById(playbackId: PlaybackId): void {
        const voice = this.activeVoices.get(playbackId);
        if (voice) {
            voice.logicalState = 'playing';

            if (voice.physicalInstance) {
                if ('resume' in voice.physicalInstance) {
                    (voice.physicalInstance as any).resume();
                }
            }

            this.pushLifecycle('RESUME', playbackId, voice.soundId);
        }
    }

    resumeAll(soundId?: SoundId): void {
        if (soundId) {
            for (const [id, voice] of this.activeVoices.entries()) {
                if (voice.soundId === soundId) this.resumeById(id);
            }
        } else {
            for (const id of this.activeVoices.keys()) this.resumeById(id);
        }
    }

    public crossfade(outId: PlaybackId, inId: PlaybackId, duration: Milliseconds): void {
        const outVoice = this.activeVoices.get(outId);
        const inVoice = this.activeVoices.get(inId);

        if (outVoice?.physicalInstance && inVoice?.physicalInstance) {
            outVoice.physicalInstance.gainParam.cancelScheduledValues(0);
            inVoice.physicalInstance.gainParam.cancelScheduledValues(0);

            this.automation.ramp(outVoice.physicalInstance.gainParam, 0, duration, 'equal-power');
            this.automation.ramp(inVoice.physicalInstance.gainParam, 1, duration, 'equal-power');
        } else {
            console.warn(
                `[SoundController.crossfade] MISSING VOICE out=${!!outVoice} in=${!!inVoice} outId=${outId} inId=${inId}`
            );
        }
    }

    public playVirtual(soundId: SoundId, reason: VirtualReason = 'VIRTUAL_BY_API'): PlaybackId {
        const playbackId = this.nextPlaybackId++ as PlaybackId;

        const logicalVoice = {
            playbackId,
            soundId,
            logicalState: 'playing',
            position: { x: 0, y: 0, z: 0 },
            startedAtContextTime: this.context.currentTime as ContextTime,
            startOffset: 0 as Seconds,
            physicalInstance: null as any,
            isVirtualNode: true,
            virtualReason: reason
        } as unknown as ILogicalVoice;

        this.activeVoices.set(playbackId, logicalVoice);

        this.pushLifecycle('VIRTUALIZE', playbackId, soundId, reason);

        return playbackId;
    }

    public isGhostVoice(id: PlaybackId): boolean {
        const voice = this.activeVoices.get(id);
        return voice ? !!(voice as any).isVirtualNode : false;
    }

    getCurrentTime(): ContextTime {
        return this.context.currentTime as ContextTime;
    }

    getSampleRate(): number {
        return this.context.sampleRate;
    }

    public getPlaybackPositionSec(id: PlaybackId): Seconds {
        const voice = this.activeVoices.get(id);
        if (!voice) return 0 as Seconds;

        if (voice.physicalInstance && typeof voice.physicalInstance.currentTime === 'number') {
            return voice.physicalInstance.currentTime;
        }

        if ((voice as any).isVirtualNode || voice.logicalState === 'paused' || !voice.physicalInstance) {
            const ctxTime = this.context.currentTime as ContextTime;
            return (voice.startOffset + (ctxTime - voice.startedAtContextTime)) as Seconds;
        }

        return 0 as Seconds;
    }

    public getCurrentVolume(id: PlaybackId): number {
        const voice = this.activeVoices.get(id);
        if (!voice) return 0;

        return voice.physicalInstance?.gainParam?.value ?? 1;
    }

    public getVirtualReason(id: PlaybackId): VirtualReason | undefined {
        const voice = this.activeVoices.get(id);
        if (!voice) return undefined;
        return (voice as any).virtualReason;
    }

    setVolume(id: PlaybackId, targetVolume: number): void {
        const voice = this.activeVoices.get(id);
        if (voice?.physicalInstance?.gainParam) {
            this.automation.set(voice.physicalInstance.gainParam, targetVolume);
        }
    }

    getActivePlaybacks(): PlaybackId[] {
        return [...this.activeVoices.keys()];
    }

    getSoundId(id: PlaybackId): SoundId | undefined {
        return this.activeVoices.get(id)?.soundId;
    }

    getPlaybackState(id: PlaybackId): 'playing' | 'virtual' | 'stopped' {
        const voice = this.activeVoices.get(id);
        if (!voice || !voice.physicalInstance) return 'stopped';
        return voice.physicalInstance.state as 'playing' | 'virtual' | 'stopped';
    }

    getLogicalState(id: PlaybackId): 'playing' | 'paused' | undefined {
        return this.activeVoices.get(id)?.logicalState;
    }

    virtualize(id: PlaybackId, reason: VirtualReason = 'VIRTUAL_BY_API'): void {
        const voice = this.activeVoices.get(id);
        if (voice?.logicalState === 'paused') return;
        if (voice?.physicalInstance && 'virtualize' in voice.physicalInstance) {
            const instance = voice.physicalInstance;

            if (!instance.isLooping && instance.duration > 0) {
                const remainingSec = Math.max(
                    0,
                    (instance.duration - instance.currentTime) / instance.playbackRate
                ) as Seconds;
                const endTime = (this.context.currentTime + remainingSec) as ContextTime;
                this.virtualTimers.push({ playbackId: id, endTime });
            }

            const poolIndex = (instance as any)._poolIndex;
            const targetBuses = this.#sidechainLinks[poolIndex];

            if (targetBuses && instance.sidechainTriggerNode) {
                for (const busId of targetBuses.keys()) {
                    this.busSystem.removeSidechainSource(instance.sidechainTriggerNode, busId);
                }
            }

            instance.virtualize();

            (voice as any).virtualReason = reason;

            this.pushLifecycle('VIRTUALIZE', id, voice.soundId, reason);
        }
    }

    devirtualize(id: PlaybackId): void {
        const voice = this.activeVoices.get(id);
        if (voice?.logicalState === 'paused') return;
        if (voice?.physicalInstance && 'devirtualize' in voice.physicalInstance) {
            this.#removeFromVirtualQueue(id);

            const instance = voice.physicalInstance;
            instance.devirtualize();

            (voice as any).virtualReason = undefined;

            const poolIndex = (instance as any)._poolIndex;
            const targetBuses = this.#sidechainLinks[poolIndex];

            if (targetBuses && instance.sidechainTriggerNode) {
                for (const [busId, intensity] of targetBuses.entries()) {
                    this.busSystem.addSidechainSource(instance.sidechainTriggerNode, busId, intensity);
                }
            }

            if (voice.onRevive) {
                voice.onRevive(id);
            }

            this.pushLifecycle('REVIVE', id, voice.soundId);
        }
    }

    fadeVolume(
        id: PlaybackId,
        targetVolume: number,
        duration: Milliseconds,
        curveType: 'linear' | 'equal-power' = 'linear',
        delay: Milliseconds = 0 as Milliseconds
    ): void {
        const voice = this.activeVoices.get(id);
        if (voice?.physicalInstance?.gainParam) {
            this.automation.ramp(voice.physicalInstance.gainParam, targetVolume, duration, curveType, delay);
        }
    }

    fadeParameter(
        id: PlaybackId,
        target: 'gain' | 'pitch' | 'pan' | 'filterFrequency',
        targetValue: number,
        duration: Milliseconds
    ): void {
        const voice = this.activeVoices.get(id);
        if (voice?.physicalInstance) {
            voice.physicalInstance.automate(target, targetValue, duration);
        }
    }

    cancelScheduled(id: PlaybackId): void {
        const voice = this.activeVoices.get(id);
        if (voice?.physicalInstance) {
            voice.physicalInstance.cancelScheduled();
        }
    }

    onVoiceEnded(id: PlaybackId, callback: () => void): () => void {
        const voice = this.activeVoices.get(id);
        if (voice?.physicalInstance) {
            return voice.physicalInstance.on('ended', callback);
        }

        return () => void 0;
    }

    #handleVoiceEnded = (instance: any): void => {
        const playbackId = instance._currentPlaybackId;
        if (playbackId) {
            const voice = this.activeVoices.get(playbackId);
            if (voice) {
                this.pushLifecycle('STOP', playbackId, voice.soundId, 'NATURAL_END');
            }
            this.activeVoices.delete(playbackId);
            this.#removeFromVirtualQueue(playbackId);
        }
    };

    #handleInstanceReleased = (instance: any): void => {
        const poolIndex = instance._poolIndex;
        if (poolIndex === undefined || poolIndex < 0) return;

        const targetBuses = this.#sidechainLinks[poolIndex];

        if (instance.sidechainTriggerNode) {
            for (const busId of targetBuses.keys()) {
                this.busSystem.removeSidechainSource(instance.sidechainTriggerNode, busId);
            }
        }
        targetBuses.clear();
    };

    #removeFromVirtualQueue(playbackId: PlaybackId): void {
        const timers = this.virtualTimers;
        for (let index = 0; index < timers.length; index++) {
            if (timers[index].playbackId === playbackId) {
                timers[index] = timers[timers.length - 1];
                timers.pop();
                break;
            }
        }
    }

    private pushLifecycle(action: LifecycleAction, playbackId: PlaybackId, soundId: SoundId, reason?: string): void {
        if (!this.telemetry) return;

        const dto = this.lifecyclePool.getNext();

        // oxlint-disable-next-line typescript/no-explicit-any
        (dto as any).timestampMs = (this.getCurrentTime() * 1000) as Milliseconds;
        // oxlint-disable-next-line typescript/no-explicit-any
        (dto as any).action = action;
        // oxlint-disable-next-line typescript/no-explicit-any
        (dto as any).playbackId = playbackId;
        // oxlint-disable-next-line typescript/no-explicit-any
        (dto as any).soundId = soundId;
        // oxlint-disable-next-line typescript/no-explicit-any
        (dto as any).reason = reason;

        this.telemetry.dispatch(dto);
    }
}
