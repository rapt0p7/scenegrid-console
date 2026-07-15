import type { GridDivision } from '@scene-grid/shared';

export interface IAudioGrid {
    readonly ppqn: number;
    readonly beatsPerBar: number;
    getNextBeatTime(currentTime: number, interval?: number): number;
    getNextBarTime(currentTime: number, interval?: number): number;
    getNextDivisionTime(currentTime: number, division: GridDivision): number;
    getTimeAtPulse(pulseIndex: number): number;
    getPulseAtTime(currentTime: number): number;
}
