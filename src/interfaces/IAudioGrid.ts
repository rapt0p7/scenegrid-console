export interface IAudioGrid {
    getNextBeatTime(currentTime: number, interval: number): number;
    getNextBarTime(currentTime: number, interval: number): number;
}
