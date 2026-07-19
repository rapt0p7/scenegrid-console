import type { Beats, ContextTime, GridDivision, Pulses } from '@scene-grid/shared';

export interface IAudioGrid {
    readonly ppqn: Pulses;
    readonly beatsPerBar: Beats;
    getNextBeatTime(currentTime: ContextTime, interval?: Beats): ContextTime;
    getNextBarTime(currentTime: ContextTime, interval?: number): ContextTime;
    getNextDivisionTime(currentTime: ContextTime, division: GridDivision): ContextTime;
    getTimeAtPulse(pulseIndex: Pulses): ContextTime;
    getPulseAtTime(currentTime: ContextTime): Pulses;
}
