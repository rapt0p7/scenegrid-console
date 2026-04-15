import type { IControllerPlayOptions, ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { BusId, PlaybackId, SoundId } from '@domain/Types/Branded.js';
import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type AudioBusSystem from '@infrastructure/busSystem/AudioBusSystem.js';
import type SoundPoolManager from '@infrastructure/instance/SoundPoolManager.js';
import type { PlaybackScheduler } from '@infrastructure/scheduling/PlaybackScheduler.js';
import type { AudioCtx } from '@infrastructure/types/IAudioContext';
import type { ILogicalVoice } from '@infrastructure/types/ILogicalVoice.js';
import type { ISoundOptions } from '@infrastructure/types/ISoundOptions.js';

export interface SoundDefinition {
    buffer: AudioBuffer;
    options: ISoundOptions;
}

const DEFAULT_COOLDOWN_MS = 15;

export class SoundController implements ISoundController {
    public readonly activeVoices = new Map<PlaybackId, ILogicalVoice>();

    private readonly lastPlayTimes = new Map<SoundId, number>();
    private nextPlaybackId = 1 as PlaybackId;
    readonly #sidechainLinks: Array<Set<BusId>>;

    // eslint-disable-next-line max-params
    constructor(
        private readonly pool: SoundPoolManager,
        private readonly scheduler: PlaybackScheduler,
        private readonly context: AudioCtx,
        private readonly automation: AutomationEngine,
        private readonly registry = new Map<SoundId, SoundDefinition>(),
        private readonly busSystem: AudioBusSystem
    ) {
        this.#sidechainLinks = Array.from({ length: pool.globalVoiceLimit }, () => new Set<BusId>());
        this.pool.events.on('released', this.#handleInstanceReleased);
    }

    // eslint-disable-next-line unicorn/no-object-as-default-parameter
    register(soundId: SoundId, buffer: AudioBuffer, options: ISoundOptions = { url: '' }): void {
        if (this.registry.has(soundId)) return;
        this.registry.set(soundId, { buffer, options });
    }

    unregister(soundId: SoundId): void {
        this.registry.delete(soundId);
        this.pool.dispose(soundId);
        this.lastPlayTimes.delete(soundId);
    }

    play(
        soundId: SoundId,
        { when = 0, offset = 0, duration, loop = false, rate = 1, onRevive }: IControllerPlayOptions
    ): PlaybackId | null {
        if (!this.registry.has(soundId)) return null;

        const now = performance.now();
        const lastPlay = this.lastPlayTimes.get(soundId) || 0;
        const definition = this.registry.get(soundId)!;

        const cooldownMs = definition.options.cooldownMs ?? DEFAULT_COOLDOWN_MS;

        if (now - lastPlay < cooldownMs) {
            return null;
        }

        this.lastPlayTimes.set(soundId, now);

        const instance = this.pool.acquire(soundId, definition.buffer);

        if (!instance) return null;

        const playbackId = this.nextPlaybackId++ as PlaybackId;

        const logicalVoice: ILogicalVoice = {
            playbackId,
            soundId,
            position: { x: 0, y: 0, z: 0 },
            startedAtContextTime: this.context.currentTime,
            startOffset: offset || 0,
            physicalInstance: instance,
            onRevive: onRevive ? () => onRevive(playbackId) : undefined
        };

        (instance as any)._currentPlaybackId = playbackId;

        this.activeVoices.set(playbackId, logicalVoice);

        instance.setLoop(loop);
        instance.setRate(rate);

        instance.on('ended', this.#handleVoiceEnded);

        this.scheduler.schedulePlay(instance, when, offset, duration);

        return playbackId;
    }

    // eslint-disable-next-line max-params
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

    public get debugPool(): SoundPoolManager {
        return this.pool;
    }

    public routeToBus(playbackId: PlaybackId, busId: BusId): void {
        const voice = this.getLogicalVoice(playbackId);
        const node = voice?.physicalInstance?.outputNode;

        if (node) {
            this.busSystem.connectNodeToBus(node, busId);
        }
    }

    public addSidechainTrigger(playbackId: PlaybackId, busId: BusId, intensity: number): void {
        const voice = this.getLogicalVoice(playbackId);
        const instance = voice?.physicalInstance;
        const node = instance?.instanceGain;

        if (instance && node) {
            const poolIndex = (instance as any)._poolIndex;
            this.busSystem.addSidechainSource(node, busId, intensity);
            this.#sidechainLinks[poolIndex]?.add(busId);
        }
    }

    public removeSidechainTrigger(playbackId: PlaybackId, busId: BusId): void {
        const voice = this.getLogicalVoice(playbackId);
        const instance = voice?.physicalInstance;
        const node = instance?.instanceGain;

        if (node) {
            const poolIndex = (instance as any)._poolIndex;
            this.busSystem.removeSidechainSource(node, busId);
            this.#sidechainLinks[poolIndex]?.delete(busId);
        }
    }

    getLogicalVoice(playbackId: PlaybackId): ILogicalVoice | undefined {
        return this.activeVoices.get(playbackId);
    }

    stopById(playbackId: PlaybackId, timeToStop?: number): void {
        const voice = this.activeVoices.get(playbackId);
        if (voice && voice.physicalInstance) {
            voice.physicalInstance.stop(timeToStop);
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

    getCurrentTime(): number {
        return this.context.currentTime;
    }

    getSampleRate(): number {
        return this.context.sampleRate;
    }

    setVolume(id: PlaybackId, targetVolume: number): void {
        const voice = this.activeVoices.get(id);
        if (voice?.physicalInstance?.instanceGain) {
            this.automation.set(voice.physicalInstance.instanceGain.gain, targetVolume);
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

    virtualize(id: PlaybackId): void {
        const voice = this.activeVoices.get(id);
        if (voice?.physicalInstance && 'virtualize' in voice.physicalInstance) {
            voice.physicalInstance.virtualize();
        }
    }

    devirtualize(id: PlaybackId): void {
        const voice = this.activeVoices.get(id);
        if (voice?.physicalInstance && 'devirtualize' in voice.physicalInstance) {
            voice.physicalInstance.devirtualize();

            if (voice.onRevive) {
                voice.onRevive(id);
            }
        }
    }

    // eslint-disable-next-line max-params
    fadeVolume(
        id: PlaybackId,
        targetVolume: number,
        durationMs: number,
        curveType: 'linear' | 'equal-power' = 'linear',
        delayMs: number = 0
    ): void {
        const voice = this.activeVoices.get(id);
        if (voice?.physicalInstance?.instanceGain) {
            this.automation.ramp(
                voice.physicalInstance.instanceGain.gain,
                targetVolume,
                durationMs,
                curveType,
                delayMs
            );
        }
    }

    // eslint-disable-next-line max-params
    fadeParameter(
        id: PlaybackId,
        target: 'gain' | 'pitch' | 'pan' | 'filterFrequency',
        targetValue: number,
        durationMs: number
    ): void {
        const voice = this.activeVoices.get(id);
        if (voice?.physicalInstance) {
            voice.physicalInstance.automate(target, targetValue, durationMs);
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
        // eslint-disable-next-line unicorn/consistent-function-scoping
        return () => void 0;
    }

    #handleVoiceEnded = (instance: any): void => {
        const playbackId = (instance as any)._currentPlaybackId;
        if (playbackId) {
            this.activeVoices.delete(playbackId);
        }
    };

    #handleInstanceReleased = (instance: any): void => {
        const poolIndex = (instance as any)._poolIndex;
        if (poolIndex === undefined || poolIndex < 0) return;

        const targetBuses = this.#sidechainLinks[poolIndex];
        for (const busId of targetBuses) {
            this.busSystem.removeSidechainSource(instance.instanceGain, busId);
        }
        targetBuses.clear();
    };
}
