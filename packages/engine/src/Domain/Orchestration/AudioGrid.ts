import type { IAudioGrid } from '@domain/Orchestration/Ports/IAudioGrid.js';

export default class AudioGrid implements IAudioGrid {
    readonly #bpm: number;
    readonly #ppqn: number;
    readonly #beatsPerBar: number;
    readonly #startTime: number;

    constructor(bpm: number, beatsPerBar: number = 4, startTime: number = 0, ppqn: number = 960) {
        this.#bpm = bpm;
        this.#beatsPerBar = beatsPerBar;
        this.#startTime = startTime;
        this.#ppqn = ppqn;
    }

    public get ppqn(): number {
        return this.#ppqn;
    }

    public getNextBeatTime(currentTime: number, interval: number = 1): number {
        const secondsPerBeat = 60 / this.#bpm;
        const secondsPerInterval = secondsPerBeat * interval;

        const elapsed = currentTime - this.#startTime;
        const safeElapsed = Math.max(0, elapsed + 0.001);

        const intervalsElapsed = Math.ceil(safeElapsed / secondsPerInterval);
        return this.#startTime + intervalsElapsed * secondsPerInterval;
    }

    public getNextBarTime(currentTime: number, interval: number = 1): number {
        const secondsPerBar = (60 / this.#bpm) * this.#beatsPerBar;
        const secondsPerInterval = secondsPerBar * interval;

        const elapsed = currentTime - this.#startTime;
        const safeElapsed = Math.max(0, elapsed + 0.001);

        const intervalsElapsed = Math.ceil(safeElapsed / secondsPerInterval);
        return this.#startTime + intervalsElapsed * secondsPerInterval;
    }

    public getTimeAtPulse(targetPulseIndex: number): number {
        const numerator = 60 * targetPulseIndex;
        const denominator = this.#bpm * this.#ppqn;
        const elapsedSeconds = numerator / denominator;

        return this.#startTime + elapsedSeconds;
    }

    public getPulseAtTime(currentTime: number): number {
        if (currentTime <= this.#startTime) {
            return 0;
        }

        const elapsedSeconds = currentTime - this.#startTime;

        const numerator = elapsedSeconds * this.#bpm * this.#ppqn;
        const denominator = 60;

        return Math.round(numerator / denominator);
    }
}
