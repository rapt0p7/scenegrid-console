// noinspection D

import mitt from 'mitt';

import { NodeChain } from '@infrastructure/nodes/NodeChain.js';

import type { SoundId } from '@domain/Types/Branded.js';
import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type AudioContextManager from '@infrastructure/context/AudioContextManager.js';
import type { AudioNodeFactory, PannerConfig } from '@infrastructure/nodes/AudioNodeFactory.js';
import type { INodeChainOptions } from '@infrastructure/nodes/NodeChain.js';
import type {
    AudioBufferSourceNodeLike,
    AudioNodeLike,
    GainNodeLike,
    PannerNodeLike,
    StereoPannerNodeLike
} from '@infrastructure/types/IAudioContext.js';
import type { PlaybackState } from '@infrastructure/types/IPlaybackController.js';
import type { InstanceParameterTarget, ISoundInstance } from '@infrastructure/types/ISoundInstance.js';
import type { Emitter } from 'mitt';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
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
    #startTime: number = 0;
    #pauseOffset: number = 0;
    #playbackRate: number = 1;
    #loop: boolean = false;
    #endedByStop: boolean = false;
    private readonly SCHEDULE_DELAY = 0.05;

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

    public get outputNode(): AudioNodeLike {
        return this.#chain.outputNode;
    }

    public get instanceGain(): GainNodeLike {
        return this.#chain.instanceGain;
    }

    public get state(): PlaybackState {
        return this.#state;
    }

    public get currentTime(): number {
        if (!this.#buffer) return 0;

        if (this.#state === 'playing') {
            const now = this.#ctxManager.context.currentTime;
            const elapsed = now - this.#startTime;
            return elapsed % this.#buffer.duration;
        }

        if (this.#state === 'paused') {
            return this.#pauseOffset;
        }

        return 0;
    }

    public get duration(): number {
        return this.#buffer?.duration ?? 0;
    }

    public rebind(
        newId: SoundId,
        buffer: AudioBuffer,
        options?: { spatial?: PannerConfig; hasPanner?: boolean }
    ): void {
        if (this.#state === 'playing' || this.#state === 'virtual') {
            this.stop(0);
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

    public automate(target: InstanceParameterTarget, value: number, smoothingMs: number = 50): void {
        switch (target) {
            case 'gain': {
                this.#automation.ramp(this.#chain.instanceGain.gain, value, smoothingMs, 'exponential');
                break;
            }

            case 'pitch': {
                this.#playbackRate = value;
                if (this.#source) {
                    this.#automation.ramp(this.#source.playbackRate, value, smoothingMs, 'linear');
                }
                break;
            }

            case 'pan': {
                const panner = this.#chain.pannerNode;
                if (panner && 'pan' in panner) {
                    this.#automation.ramp(panner.pan, value, smoothingMs, 'linear');
                }
                break;
            }

            case 'filterFrequency': {
                const filter = this.#chain.mainFilterNode;
                if (filter && 'frequency' in filter) {
                    this.#automation.ramp(filter.frequency, value, smoothingMs, 'exponential');
                }
                break;
            }

            default: {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/naming-convention
                const _exhaustiveCheck: never = target;
            }
        }
    }

    public play(when: number = 0, offset: number = 0, duration?: number): void {
        if (!this.#buffer) return;

        if (this.#source) {
            this.stop();
        }

        const context = this.#ctxManager.context;
        const now = context.currentTime;
        const startTime = Math.max(now, when);

        this.#endedByStop = false;

        const source = this.#createAndBindSource();
        source.start(startTime, offset, duration);

        this.#source = source;
        this.#startTime = startTime - offset;
        this.#pauseOffset = 0;

        this.#setState('playing');
    }

    public stop(when: number = 0): void {
        if (!this.#source) return;

        const context = this.#ctxManager.context;

        if (when > 0) {
            try {
                this.#source.stop(context.currentTime + when);
            } catch {
                /* empty */
            }
            return;
        }

        this.#endedByStop = true;

        try {
            this.#source.stop(context.currentTime);
        } catch {
            /* empty */
        }

        this.#source.disconnect();
        this.#source = null;

        this.#pauseOffset = 0;
        this.#setState('stopped');
        this.#emitter.emit('stopped', this);
        this.#emitter.emit('ended', this);
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

        const now = this.#ctxManager.context.currentTime;

        const source = this.#createAndBindSource();
        source.start(now, this.#pauseOffset);

        this.#source = source;
        this.#startTime = now - this.#pauseOffset;

        this.#setState('playing');
        this.#pauseOffset = 0;
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
        if (!this.#source) return;

        this.#endedByStop = true;

        this.#source.removeEventListener('ended', this.#onSourceEnded);

        try {
            this.#source.stop(0);
        } catch {
            /* empty */
        }

        const gain = this.#chain.instanceGain?.gain;
        if (gain) {
            try {
                gain.cancelScheduledValues(0);
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
        const startTimeWithLookAhead = now + this.SCHEDULE_DELAY;
        const elapsed = Math.max(0, startTimeWithLookAhead - this.#startTime);
        const offsetInFuture = elapsed % this.#buffer.duration;

        const source = this.#createAndBindSource();

        source.start(startTimeWithLookAhead, offsetInFuture);

        this.#source = source;

        this.#startTime = startTimeWithLookAhead - offsetInFuture;

        this.#setState('playing');
    }

    public resetForReuse(): void {
        this.cancelScheduled();

        this.automate('gain', 1, 0);
        this.automate('pitch', 1, 0);
        this.automate('pan', 0, 0);
        // this.automate('filterFrequency', 22000, 0);

        if (this.#chain.pannerNode) {
            this.setPosition(0, 0, 0);
        }

        this.#endedByStop = false;
        this.#playbackRate = 1;
        this.#loop = false;
        this.#pauseOffset = 0;
        this.#startTime = 0;

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
        this.stop();
        this.#chain.dispose();
        this.#buffer = null;
        this.#setState('idle');
        this.#emitter.emit('disposed', this);
        this.#emitter.all.clear();
    }

    public on(event: 'ended' | 'stopped' | 'disposed', handler: (instance: ISoundInstance) => void): () => void {
        this.#emitter.on(event, handler);
        return () => this.#emitter.off(event, handler);
    }

    #onSourceEnded = (): void => {
        if (this.#endedByStop) return;

        if (this.#state === 'virtual') return;

        if (this.#state !== 'playing') return;

        this.#source = null;
        this.#setState('idle');
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

        source.connect(this.#chain.inputNode);

        source.addEventListener('ended', this.#onSourceEnded);

        return source;
    }
}
