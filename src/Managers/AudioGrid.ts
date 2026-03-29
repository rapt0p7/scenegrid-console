import type { IAudioGrid } from '../interfaces/IAudioGrid.js';

export default class AudioGrid implements IAudioGrid {
    readonly #bpm: number;
    readonly #beatsPerBar: number;
    readonly #startTime: number;

    constructor(bpm: number, beatsPerBar: number = 4, startTime: number = 0) {
        this.#bpm = bpm;
        this.#beatsPerBar = beatsPerBar;
        this.#startTime = startTime;
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
}
