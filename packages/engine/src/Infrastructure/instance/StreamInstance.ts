// oxlint-disable no-underscore-dangle
/* eslint-disable @typescript-eslint/naming-convention */
import type { IStreamManifest } from '@domain/Configuration/Ports/IStreamManifest.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { Seconds, ContextTime, Milliseconds, SoundId } from '@scene-grid/shared';

import type { StreamNode } from '../nodes/StreamNode.js';
import type { PlaybackState } from '../types/IPlaybackController.js';
import type { ISoundInstance, InstanceParameterTarget, ISoundConfig } from '../types/ISoundInstance.js';

export class StreamInstance implements ISoundInstance, ITickable {
    public id: SoundId = 'UNKNOWN_STREAM' as SoundId;
    public _poolIndex = -1;

    public readonly sidechainTriggerNode: AudioNode;

    private currentDestination: AudioNode | null = null;

    private readonly listeners = new Map<string, Set<(instance: ISoundInstance) => void>>();
    private isVirtualState = false;
    private _isLooping: boolean;

    constructor(
        private readonly streamNode: StreamNode,
        private readonly manifest: IStreamManifest
    ) {
        this.sidechainTriggerNode = this.streamNode.output;
        this._isLooping = manifest.isLooping;

        this.streamNode.onEnded = () => {
            this.emit('ended', this);
        };
    }

    public get state(): PlaybackState {
        if (this.isVirtualState) return 'virtual';
        return this.streamNode.isPlaying ? 'playing' : 'stopped';
    }

    public get currentTime(): Seconds {
        return this.streamNode.getLogicalCurrentTime() as Seconds;
    }

    public get duration(): Seconds {
        const totalSamples = this.manifest.chunks.reduce((acc, chunk) => acc + chunk.durationSamples, 0);
        return (totalSamples / (this.streamNode.contextSampleRate || 44100)) as Seconds;
    }

    public get isLooping(): boolean {
        return this._isLooping;
    }

    public get playbackRate(): number {
        return 1;
    }

    public get gainParam(): AudioParam {
        return this.streamNode.output.gain;
    }

    public get pannerNode(): null {
        return null;
    }

    public play(when?: ContextTime, _offset?: Seconds, _duration?: Seconds): void {
        this.streamNode.start(when);
    }

    public stop(when?: ContextTime): void {
        this.streamNode.stop(when);
        this.emit('stopped', this);
        this.emit('ended', this);
    }

    public pause(): void {
        this.streamNode.pause();
    }

    public resume(): void {
        this.streamNode.resume();
    }

    public setRate(_rate: number): void {
        // No-op for network streams
    }

    public setLoop(loop: boolean): void {
        this._isLooping = loop;
        this.streamNode.setLoop(loop);
    }

    public connectTo(destination: AudioNode): void {
        this.currentDestination = destination;
        this.streamNode.connect(destination);
    }

    public disconnectRoute(): void {
        this.currentDestination = null;
        this.streamNode.disconnect();
    }

    public virtualize(): void {
        this.isVirtualState = true;

        this.streamNode.disconnect();
    }

    public devirtualize(): void {
        this.isVirtualState = false;

        if (this.currentDestination) {
            this.streamNode.connect(this.currentDestination);
        }
    }

    public tick(currentTimeSec: number, physicalDeltaMs: number): void {
        this.streamNode.tick(currentTimeSec, physicalDeltaMs);
    }

    public automate(target: InstanceParameterTarget, targetValue: number, duration: Milliseconds): void {
        if (target === 'gain') {
            const now = this.streamNode.context.currentTime;
            this.gainParam.linearRampToValueAtTime(targetValue, now + duration / 1000);
        }
    }

    public cancelScheduled(): void {
        const now = this.streamNode.context.currentTime;
        this.gainParam.cancelScheduledValues(now);
    }

    public dispose(): void {
        this.stop();
        this.emit('disposed', this);
        this.listeners.clear();
    }

    public forceNaturalEnd(): void {
        if (this.state === 'virtual') {
            this.isVirtualState = false;
            this.emit('ended', this);
        }
    }

    public rebind(id: SoundId, _buffer: AudioBuffer, _config?: ISoundConfig): void {
        this.id = id;
    }

    public resetForReuse(): void {
        this.cancelScheduled();
    }

    // oxlint-disable-next-line no-unused-vars
    public setPosition(x: number, y: number, z: number): void {
        // No-op because pannerNode is null
    }

    public on(event: 'ended' | 'stopped' | 'disposed', handler: (instance: ISoundInstance) => void): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(handler);
        return () => this.listeners.get(event)!.delete(handler);
    }

    private emit(event: 'ended' | 'stopped' | 'disposed', instance: ISoundInstance): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => {
                cb(instance);
            });
        }
    }
}
