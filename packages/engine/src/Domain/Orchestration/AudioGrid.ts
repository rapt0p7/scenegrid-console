import { TimeMath } from '@scene-grid/shared';
import type { IAudioGrid } from '@domain/Orchestration/Ports/IAudioGrid.js';
import type { GridDivision, BPM, Beats, ContextTime, Pulses, Seconds } from '@scene-grid/shared';

export default class AudioGrid implements IAudioGrid {
    readonly #bpm: BPM;
    readonly #ppqn: Pulses;
    readonly #beatsPerBar: Beats;
    readonly #startTime: ContextTime;

    // eslint-disable-next-line max-params
    constructor(
        bpm: BPM,
        beatsPerBar: Beats = 4 as Beats,
        startTime: ContextTime = 0 as ContextTime,
        ppqn: Pulses = 960 as Pulses
    ) {
        this.#bpm = bpm;
        this.#beatsPerBar = beatsPerBar;
        this.#startTime = startTime;
        this.#ppqn = ppqn;
    }

    public get ppqn(): Pulses {
        return this.#ppqn;
    }

    public get beatsPerBar(): Beats {
        return this.#beatsPerBar;
    }

    public getNextBeatTime(currentTime: ContextTime, interval: Beats = 1 as Beats): ContextTime {
        const secondsPerBeat = TimeMath.bpmToSecondsPerBeat(this.#bpm);
        const secondsPerInterval = (secondsPerBeat * interval) as Seconds;

        const elapsed = (currentTime - this.#startTime) as Seconds;
        const safeElapsed = Math.max(0, elapsed + 0.001) as Seconds;

        const intervalsElapsed = Math.ceil(safeElapsed / secondsPerInterval);
        const offset = (intervalsElapsed * secondsPerInterval) as Seconds;

        return TimeMath.addTime(this.#startTime, offset);
    }

    public getNextBarTime(currentTime: ContextTime, interval: number = 1): ContextTime {
        const secondsPerBeat = TimeMath.bpmToSecondsPerBeat(this.#bpm);
        const secondsPerBar = (secondsPerBeat * this.#beatsPerBar) as Seconds;
        const secondsPerInterval = (secondsPerBar * interval) as Seconds;

        const elapsed = (currentTime - this.#startTime) as Seconds;
        const safeElapsed = Math.max(0, elapsed + 0.001) as Seconds;

        const intervalsElapsed = Math.ceil(safeElapsed / secondsPerInterval);
        const offset = (intervalsElapsed * secondsPerInterval) as Seconds;

        return TimeMath.addTime(this.#startTime, offset);
    }

    public getTimeAtPulse(targetPulseIndex: Pulses): ContextTime {
        const numerator = 60 * targetPulseIndex;
        const denominator = this.#bpm * this.#ppqn;
        const elapsedSeconds = (numerator / denominator) as Seconds;

        return TimeMath.addTime(this.#startTime, elapsedSeconds);
    }

    public getPulseAtTime(currentTime: ContextTime): Pulses {
        if (currentTime <= this.#startTime) {
            return 0 as Pulses;
        }

        const elapsedSeconds = (currentTime - this.#startTime) as Seconds;

        const numerator = elapsedSeconds * this.#bpm * this.#ppqn;
        const denominator = 60;

        return Math.round(numerator / denominator) as Pulses;
    }

    public getNextDivisionTime(currentTime: ContextTime, division: GridDivision): ContextTime {
        let divisionFactor = 1;
        switch (division) {
            case '1/8':
                divisionFactor = 2;
                break;
            case '1/16':
                divisionFactor = 4;
                break;
            case '1/32':
                divisionFactor = 8;
                break;
        }

        const pulsesPerDivision = Math.floor(this.#ppqn / divisionFactor) as Pulses;
        const currentPulse = this.getPulseAtTime(currentTime);

        const intervalsElapsed = Math.ceil((currentPulse + 1) / pulsesPerDivision);
        const targetPulse = (intervalsElapsed * pulsesPerDivision) as Pulses;

        return this.getTimeAtPulse(targetPulse);
    }
}
