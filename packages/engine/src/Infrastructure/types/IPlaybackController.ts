import type { ContextTime, Seconds } from '@scene-grid/shared';

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped' | 'virtual';

export interface IPlaybackController {
    readonly state: PlaybackState;
    readonly currentTime: Seconds;
    readonly duration: Seconds;
    readonly isLooping: boolean;
    readonly playbackRate: number;

    play(when?: ContextTime, offset?: Seconds, duration?: Seconds): void;
    stop(when?: ContextTime): void;
    pause(): void;
    resume(): void;
    setRate(rate: number): void;
    setLoop(loop: boolean): void;
}
