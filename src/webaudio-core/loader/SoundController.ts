import type SoundPoolManager from '@webaudio-core/instance/SoundPoolManager.js';
import type { PlaybackScheduler } from '@webaudio-core/scheduling/PlaybackScheduler.js';
import type { ILogicalVoice } from '@webaudio-core/types/ILogicalVoice.js';
import type { ISoundInstance } from '@webaudio-core/types/ISoundInstance.js';
import type { ISoundOptions } from '@webaudio-core/types/ISoundOptions.js';

export interface SoundDefinition {
    buffer: AudioBuffer;
    options: ISoundOptions;
}

export interface IControllerPlayOptions {
    when?: number;
    offset?: number;
    duration?: number;
    loop?: boolean;
    rate?: number;
    onRevive?: (instance: ISoundInstance) => void;
}

const DEFAULT_COOLDOWN_MS = 15;

export class SoundController {
    public readonly activeVoices = new Map<number, ILogicalVoice>();

    private readonly lastPlayTimes = new Map<string, number>();
    private nextPlaybackId = 1;

    constructor(
        private readonly pool: SoundPoolManager,
        private readonly scheduler: PlaybackScheduler,
        private readonly registry = new Map<string, SoundDefinition>()
    ) {}

    // eslint-disable-next-line unicorn/no-object-as-default-parameter
    register(soundId: string, buffer: AudioBuffer, options: ISoundOptions = { url: '' }): void {
        if (this.registry.has(soundId)) {
            throw new Error(`Sound "${soundId}" already registered`);
        }

        this.registry.set(soundId, { buffer, options });
    }

    unregister(soundId: string): void {
        this.registry.delete(soundId);
        this.pool.dispose(soundId);
        this.lastPlayTimes.delete(soundId);
    }

    play(
        soundId: string,
        { when = 0, offset = 0, duration, loop = false, rate = 1, onRevive }: IControllerPlayOptions
    ): { playbackId: number; instance: ISoundInstance } | null {
        if (!this.registry.has(soundId)) return null;

        const now = performance.now();
        const lastPlay = this.lastPlayTimes.get(soundId) || 0;
        const definition = this.registry.get(soundId)!;

        const cooldownMs = definition.options.cooldownMs ?? DEFAULT_COOLDOWN_MS;

        if (now - lastPlay < cooldownMs) {
            return null;
        }

        this.lastPlayTimes.set(soundId, now);

        const instance = this.pool.acquire(soundId);

        if (!instance) return null;

        const playbackId = this.nextPlaybackId++;

        const logicalVoice: ILogicalVoice = {
            playbackId,
            soundId,
            position: { x: 0, y: 0, z: 0 },
            startedAtContextTime: 0,
            startOffset: offset || 0,
            physicalInstance: instance,
            onRevive: onRevive
        };

        this.activeVoices.set(playbackId, logicalVoice);

        (instance as any).playbackId = playbackId;
        (instance as any).onRevive = onRevive;
        instance.setLoop(loop || false);
        instance.setRate(rate || 1);
        this.scheduler.schedulePlay(instance, when, offset, duration);

        return { playbackId, instance };
    }

    // eslint-disable-next-line max-params
    public setPosition(playbackId: number, x: number, y: number, z: number): void {
        const voice = this.activeVoices.get(playbackId);
        if (!voice) return;

        voice.position.x = x;
        voice.position.y = y;
        voice.position.z = z;

        if (voice.physicalInstance) {
            voice.physicalInstance.setPosition(x, y, z);
        }
    }

    getLogicalVoice(playbackId: number): ILogicalVoice | undefined {
        return this.activeVoices.get(playbackId);
    }

    stopById(playbackId: number): void {
        const voice = this.activeVoices.get(playbackId);
        if (voice && voice.physicalInstance) {
            voice.physicalInstance.stop();
        }
        this.activeVoices.delete(playbackId);
    }

    stopAll(soundId?: string): void {
        this.pool.dispose(soundId);
        if (soundId) {
            for (const [id, voice] of this.activeVoices.entries()) {
                if (voice.soundId === soundId) {
                    this.activeVoices.delete(id);
                }
            }
        } else {
            this.activeVoices.clear();
        }
    }
}
