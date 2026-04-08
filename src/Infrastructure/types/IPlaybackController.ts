export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped' | 'virtual';

export interface IPlaybackController {
    readonly state: PlaybackState;
    readonly currentTime: number;
    readonly duration: number;

    play(when?: number, offset?: number, duration?: number): void;
    stop(when?: number): void;
    pause(): void;
    resume(): void;
    setRate(rate: number): void;
    setLoop(loop: boolean): void;
}
