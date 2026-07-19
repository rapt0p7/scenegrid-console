import type { Seconds, Milliseconds, Samples, BPM, ContextTime, Beats } from '../Types/Branded.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const TimeMath = {
    msToSeconds: (ms: Milliseconds): Seconds => (ms / 1000) as Seconds,
    secondsToMilliseconds: (sec: Seconds): Milliseconds => (sec * 1000) as Milliseconds,

    secondsToSamples: (sec: Seconds, sampleRate: number): Samples => Math.round(sec * sampleRate) as Samples,
    samplesToSeconds: (samples: Samples, sampleRate: number): Seconds => (samples / sampleRate) as Seconds,
    msToSamples: (ms: Milliseconds, sampleRate: number): Samples => Math.round((ms / 1000) * sampleRate) as Samples,
    samplesToMs: (samples: Samples, sampleRate: number): Milliseconds =>
        ((samples / sampleRate) * 1000) as Milliseconds,

    bpmToSecondsPerBeat: (bpm: BPM): Seconds => (60 / bpm) as Seconds,
    bpmToMsPerBeat: (bpm: BPM): Milliseconds => (60000 / bpm) as Milliseconds,
    beatsToSeconds: (beats: Beats, bpm: BPM): Seconds => (beats * (60 / bpm)) as Seconds,
    secondsToBeats: (sec: Seconds, bpm: BPM): Beats => (sec * (bpm / 60)) as Beats,

    addTime: (time: ContextTime, offset: Seconds | ContextTime): ContextTime => (time + offset) as ContextTime,

    timeSince: (now: ContextTime, pastTime: ContextTime): Seconds => Math.max(0, now - pastTime) as Seconds,
    timeUntil: (now: ContextTime, futureTime: ContextTime): Seconds => Math.max(0, futureTime - now) as Seconds,

    castToSeconds: (absoluteTime: ContextTime | Seconds): Seconds => absoluteTime as unknown as Seconds,

    castToContextTime: (durationSinceStart: Seconds | ContextTime): ContextTime =>
        durationSinceStart as unknown as ContextTime
} as const;
