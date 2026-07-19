// oxlint-disable max-lines-per-function
/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D,JSUnusedLocalSymbols

import mitt from 'mitt';

import { NodeChain } from '@infrastructure/nodes/NodeChain.js';

import type { SoundId, ContextTime, Seconds, Milliseconds } from '@scene-grid/shared';
import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type AudioContextManager from '@infrastructure/context/AudioContextManager.js';
import type { AudioNodeFactory, PannerConfig } from '@infrastructure/nodes/AudioNodeFactory.js';
import type { INodeChainOptions } from '@infrastructure/nodes/NodeChain.js';
import type {
    AudioBufferSourceNodeLike,
    AudioNodeLike,
    AudioParamLike,
    PannerNodeLike,
    StereoPannerNodeLike
} from '@infrastructure/types/IAudioContext.js';
import type { PlaybackState } from '@infrastructure/types/IPlaybackController.js';
import type { InstanceParameterTarget, ISoundInstance } from '@infrastructure/types/ISoundInstance.js';
import type { Emitter } from 'mitt';

export type SoundInstanceEvents = {
    ended: ISoundInstance;
    stopped: ISoundInstance;
    disposed: ISoundInstance;
};

export class SoundInstance implements ISoundInstance {
    public get id(): SoundId {
        return this.#id;
    }

    public get pannerNode(): PannerNodeLike | StereoPannerNodeLike | null {
        return this.#chain.pannerNode;
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public _poolIndex: number = -1;

    #id: SoundId;
    #automation: AutomationEngine;
    #emitter: Emitter<SoundInstanceEvents> = mitt<SoundInstanceEvents>();
    #ctxManager: AudioContextManager;
    #buffer: AudioBuffer | null = null;
    #chain: NodeChain;
    #source: AudioBufferSourceNodeLike | null = null;
    #state: PlaybackState = 'idle';
    #startTime: ContextTime = 0 as ContextTime;
    #pauseOffset: Seconds = 0 as Seconds;
    #playbackRate: number = 1;
    #loop: boolean = false;
    #endedByStop: boolean = false;
    private readonly SCHEDULE_DELAY: Seconds = 0.05 as Seconds;
    private readonly MICRO_FADE_SEC: Seconds = 0.015 as Seconds;
    private readonly LISTENER_OPTIONS = { once: true };

    // eslint-disable-next-line max-params
    constructor(
        initialId: SoundId,
        contextManager: AudioContextManager,
        factory: AudioNodeFactory,
        buffer: AudioBuffer | null,
        automation: AutomationEngine,
        options: INodeChainOptions = {}
    ) {
        this.#id = initialId;
        this.#ctxManager = contextManager;
        this.#buffer = buffer;
        this.#automation = automation;

        this.#chain = new NodeChain(factory, {
            hasPanner: options.hasPanner,
            spatial: options.spatial,
            initialFilters: options.initialFilters
        });
    }

    public get gainParam(): AudioParamLike {
        return this.#chain.gainParam;
    }

    public get sidechainTriggerNode(): AudioNodeLike {
        return this.#chain.sidechainTriggerNode;
    }

    public get state(): PlaybackState {
        return this.#state;
    }

    public get isLooping(): boolean {
        return this.#loop;
    }

    public get playbackRate(): number {
        return this.#playbackRate;
    }

    public get currentTime(): Seconds {
        if (!this.#buffer) return 0 as Seconds;

        if (this.#state === 'playing') {
            const now = this.#ctxManager.context.currentTime;
            const elapsed = now - this.#startTime;
            return (elapsed % this.#buffer.duration) as Seconds;
        }

        if (this.#state === 'paused') {
            return this.#pauseOffset;
        }

        return 0 as Seconds;
    }

    public get duration(): Seconds {
        return (this.#buffer?.duration ?? 0) as Seconds;
    }

    public connectTo(destination: AudioNodeLike): void {
        this.#chain.connectTo(destination);
    }

    public disconnectRoute(): void {
        this.#chain.disconnect();
    }

    public rebind(
        newId: SoundId,
        buffer: AudioBuffer,
        options?: { spatial?: PannerConfig; hasPanner?: boolean }
    ): void {
        if (this.#state === 'playing' || this.#state === 'virtual') {
            this.stop(0 as ContextTime);
        }

        this.#id = newId;
        this.#buffer = buffer;

        this.#chain.setPannerMode({
            spatial: options?.spatial,
            hasPanner: options?.hasPanner
        });

        if (options?.spatial) {
            this.setPosition(0, 0, 0);
        }
    }

    public automate(
        target: InstanceParameterTarget,
        value: number,
        smoothing: Milliseconds = 50 as Milliseconds
    ): void {
        switch (target) {
            case 'gain': {
                this.#automation.ramp(this.#chain.gainParam, value, smoothing, 'exponential');
                break;
            }

            case 'pitch': {
                this.#playbackRate = value;
                if (this.#source) {
                    this.#automation.ramp(this.#source.playbackRate, value, smoothing, 'linear');
                }
                break;
            }

            case 'pan': {
                const panner = this.#chain.pannerNode;
                if (panner && 'pan' in panner) {
                    this.#automation.ramp(panner.pan, value, smoothing, 'linear');
                }
                break;
            }

            case 'filterFrequency': {
                const filter = this.#chain.mainFilterNode;
                if (filter && 'frequency' in filter) {
                    this.#automation.ramp(filter.frequency, value, smoothing, 'exponential');
                }
                break;
            }

            default: {
                // eslint-disable-next-line, no-underscore-dangle
                // oxlint-disable-next-line no-underscore-dangle
                const _exhaustiveCheck: never = target;
            }
        }
    }

    public play(when: ContextTime = 0 as ContextTime, offset: Seconds = 0 as Seconds, duration?: Seconds): void {
        if (!this.#buffer) return;

        if (this.#source) {
            this.stop(0 as ContextTime);
        }

        const context = this.#ctxManager.context;
        const now = context.currentTime;
        const startTime = (when > 0 ? Math.max(now, when) : now) as ContextTime;

        this.#endedByStop = false;

        const source = this.#createAndBindSource();
        source.start(startTime, offset, duration);

        this.#source = source;
        this.#startTime = (startTime - offset) as ContextTime;
        this.#pauseOffset = 0 as Seconds;

        this.#setState('playing');
    }

    public stop(when: ContextTime = 0 as ContextTime): void {
        const context = this.#ctxManager.context;

        if (!this.#source) {
            if (this.#state === 'virtual' || this.#state === 'paused') {
                this.#endedByStop = true;
                this.#pauseOffset = 0 as Seconds;
                this.#setState('stopped');
                this.#emitter.emit('stopped', this);
                this.#emitter.emit('ended', this);
            }
            return;
        }

        const now = context.currentTime;
        const stopTime = (when > 0 ? Math.max(now, when) : now) as ContextTime;
        const actualStopTime = (stopTime + this.MICRO_FADE_SEC) as ContextTime;

        const sourceToStop = this.#source;

        try {
            const gainParam = this.#chain.gainParam;
            if (gainParam) {
                gainParam.cancelScheduledValues(stopTime);
                gainParam.setTargetAtTime(0, stopTime, 0.005);
            }
            sourceToStop.stop(actualStopTime);
        } catch {
            /* empty fallback */
        }

        this.#pauseOffset = 0 as Seconds;
        const EPS = 0.005;

        if (stopTime <= now + EPS) {
            this.#endedByStop = true;
            this.#source = null;
            this.#setState('stopped');
            this.#emitter.emit('stopped', this);
            this.#emitter.emit('ended', this);
        } else {
            this.#endedByStop = true;
            sourceToStop.addEventListener('ended', this.#onDelayedSourceEnded, this.LISTENER_OPTIONS);
        }
    }

    public forceNaturalEnd(): void {
        if (this.#state === 'virtual') {
            this.#setState('idle');
            this.#emitter.emit('ended', this);
        }
    }

    public pause(): void {
        if (this.#state !== 'playing') return;

        this.#pauseOffset = this.currentTime;

        if (this.#source) {
            try {
                this.#source.stop();
                this.#source.disconnect();
            } catch {
                /* empty */
            }
            this.#source = null;
        }

        this.#setState('paused');
    }

    public resume(): void {
        if (this.#state !== 'paused' || !this.#buffer) return;

        const now = this.#ctxManager.context.currentTime as ContextTime;

        const source = this.#createAndBindSource();
        source.start(now, this.#pauseOffset);

        this.#source = source;
        this.#startTime = (now - this.#pauseOffset) as ContextTime;

        this.#setState('playing');
        this.#pauseOffset = 0 as Seconds;
    }

    public setPosition(x: number, y: number, z: number): void {
        const panner = this.#chain.pannerNode;
        if (!panner || !('positionX' in panner)) return;

        const signZ = Math.sign(z) || 1;
        const safeZ = Math.abs(z) < 0.1 ? signZ * 0.1 : z;

        const context = this.#ctxManager.context;
        const now = context.currentTime;

        const tc = 0.01;

        panner.positionX.setTargetAtTime(x, now, tc);
        panner.positionY.setTargetAtTime(y, now, tc);
        panner.positionZ.setTargetAtTime(safeZ, now, tc);
    }

    public cancelScheduled(): void {
        if (!this.#source) {
            if (this.#state === 'virtual' || this.#state === 'paused') {
                this.#endedByStop = true;
                this.#setState('stopped');
            }
            return;
        }

        this.#endedByStop = true;

        this.#source.removeEventListener('ended', this.#onSourceEnded);
        this.#source.removeEventListener('ended', this.#onDelayedSourceEnded);

        try {
            this.#source.stop(0);
        } catch {
            /* empty */
        }

        const gainParam = this.#chain.gainParam;
        if (gainParam) {
            try {
                gainParam.cancelScheduledValues(0);
            } catch {
                /* empty */
            }
        }

        this.#source.disconnect();
        this.#source = null;

        if (this.#state === 'playing') {
            this.#setState('stopped');
        }
    }

    public virtualize(): void {
        if (this.#state !== 'playing' || !this.#source) return;

        this.#setState('virtual');

        this.#source.removeEventListener('ended', this.#onSourceEnded);
        try {
            this.#source.stop(0);
            this.#source.disconnect();
        } catch {
            /* empty */
        }

        this.#source = null;
    }

    public devirtualize(): void {
        if (this.#state !== 'virtual' || !this.#buffer) return;

        const context = this.#ctxManager.context;
        const now = context.currentTime;
        const startTimeWithLookAhead = (now + this.SCHEDULE_DELAY) as ContextTime;
        const elapsed = Math.max(0, startTimeWithLookAhead - this.#startTime);
        const offsetInFuture = (elapsed % this.#buffer.duration) as Seconds;

        const source = this.#createAndBindSource();

        source.start(startTimeWithLookAhead, offsetInFuture);

        this.#source = source;

        this.#startTime = (startTimeWithLookAhead - offsetInFuture) as ContextTime;

        this.#setState('playing');
    }

    public resetForReuse(): void {
        this.cancelScheduled();

        try {
            this.#chain.disconnect();
        } catch {
            /* empty */
        }

        this.automate('gain', 1, 0 as Milliseconds);
        this.automate('pitch', 1, 0 as Milliseconds);
        this.automate('pan', 0, 0 as Milliseconds);
        this.automate('filterFrequency', 22000, 0 as Milliseconds);

        if (this.#chain.pannerNode) {
            this.setPosition(0, 0, 0);
        }

        this.#endedByStop = false;
        this.#playbackRate = 1;
        this.#loop = false;
        this.#pauseOffset = 0 as Seconds;
        this.#startTime = 0 as ContextTime;

        this.#emitter.all.clear();
        this.#setState('idle');
    }

    public setRate(rate: number): void {
        this.#playbackRate = rate;
        if (this.#source) {
            this.#source.playbackRate.value = rate;
        }
    }

    public setLoop(loop: boolean): void {
        this.#loop = loop;
        if (this.#source) {
            this.#source.loop = loop;
        }
    }

    public dispose(): void {
        this.stop(0 as ContextTime);
        this.#chain.dispose();
        this.#buffer = null;
        this.#setState('idle');
        this.#emitter.emit('disposed', this);
        this.#emitter.all.clear();
    }

    public on(event: 'ended' | 'stopped' | 'disposed', handler: (instance: ISoundInstance) => void): () => void {
        this.#emitter.on(event, handler);
        return () => {
            this.#emitter.off(event, handler);
        };
    }

    #onSourceEnded = (): void => {
        if (this.#endedByStop) return;

        if (this.#state === 'virtual') return;

        if (this.#state !== 'playing') return;

        this.#source = null;
        this.#setState('idle');
        this.#emitter.emit('ended', this);
    };

    #onDelayedSourceEnded = (): void => {
        this.#source = null;
        this.#setState('stopped');
        this.#emitter.emit('stopped', this);
        this.#emitter.emit('ended', this);
    };

    #setState(state: PlaybackState): void {
        this.#state = state;
    }

    #createAndBindSource(): AudioBufferSourceNodeLike {
        const source = this.#ctxManager.context.createBufferSource();
        source.buffer = this.#buffer;
        source.playbackRate.value = this.#playbackRate;
        source.loop = this.#loop;

        this.#chain.connectSource(source);

        source.addEventListener('ended', this.#onSourceEnded);

        return source;
    }
}
