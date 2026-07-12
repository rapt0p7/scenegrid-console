export interface IAudioGrid {
    readonly ppqn: number;
    getNextBeatTime(currentTime: number, interval?: number): number;
    getNextBarTime(currentTime: number, interval?: number): number;
    getTimeAtPulse(pulseIndex: number): number;
    getPulseAtTime(currentTime: number): number;
}
