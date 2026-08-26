import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { describe, expect } from 'vitest';

import type { Seconds, Milliseconds, Samples, BPM, ContextTime, Beats } from '../../Types/Branded.js';

import { TimeMath } from '../TimeMath.js';

describe('TimeMath (Property-Based Tests)', () => {
    describe('Time Conversions', () => {
        test.prop([
            // oxlint-disable-next-line import/no-named-as-default-member
            fc.float({ min: 0, max: 1000000, noNaN: true, noDefaultInfinity: true })
        ])('msToSeconds and secondsToMilliseconds form a perfect round-trip', ms => {
            const seconds = TimeMath.msToSeconds(ms as Milliseconds);
            const backToMs = TimeMath.secondsToMilliseconds(seconds);

            expect(backToMs).toBeCloseTo(ms);
        });
    });

    describe('Sample Conversions', () => {
        // oxlint-disable-next-line import/no-named-as-default-member
        const sampleRateArb = fc.constantFrom(44100, 48000, 88200, 96000, 192000);

        test.prop([
            // oxlint-disable-next-line import/no-named-as-default-member
            fc.integer({ min: 0, max: 100_000_000 }),
            sampleRateArb
        ])('samplesToSeconds -> secondsToSamples returns the exact integer', (samples, sampleRate) => {
            const seconds = TimeMath.samplesToSeconds(samples as Samples, sampleRate);
            const backToSamples = TimeMath.secondsToSamples(seconds, sampleRate);

            expect(backToSamples).toBe(samples);
        });

        test.prop([
            // oxlint-disable-next-line import/no-named-as-default-member
            fc.integer({ min: 0, max: 100_000_000 }),
            sampleRateArb
        ])('samplesToMs -> msToSamples returns the exact integer', (samples, sampleRate) => {
            const ms = TimeMath.samplesToMs(samples as Samples, sampleRate);
            const backToSamples = TimeMath.msToSamples(ms, sampleRate);

            expect(backToSamples).toBe(samples);
        });
    });

    describe('Musical Time (BPM & Beats)', () => {
        // oxlint-disable-next-line import/no-named-as-default-member
        const bpmArb = fc.float({ min: 10, max: 300, noNaN: true, noDefaultInfinity: true });

        test.prop([bpmArb])('bpmToSecondsPerBeat correctly derives from BPM', bpm => {
            const secPerBeat = TimeMath.bpmToSecondsPerBeat(bpm as BPM);
            expect(secPerBeat * bpm).toBeCloseTo(60);
        });

        test.prop([bpmArb])('bpmToMsPerBeat is 1000x bpmToSecondsPerBeat', bpm => {
            const secPerBeat = TimeMath.bpmToSecondsPerBeat(bpm as BPM);
            const msPerBeat = TimeMath.bpmToMsPerBeat(bpm as BPM);

            expect(msPerBeat).toBeCloseTo(secPerBeat * 1000);
        });

        test.prop([
            // oxlint-disable-next-line import/no-named-as-default-member
            fc.float({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
            bpmArb
        ])('beatsToSeconds and secondsToBeats form a perfect round-trip', (beats, bpm) => {
            const seconds = TimeMath.beatsToSeconds(beats as Beats, bpm as BPM);
            const backToBeats = TimeMath.secondsToBeats(seconds, bpm as BPM);

            expect(backToBeats).toBeCloseTo(beats);
        });
    });

    describe('ContextTime Arithmetic', () => {
        // oxlint-disable-next-line import/no-named-as-default-member
        const timeArb = fc.float({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true });

        test.prop([timeArb, timeArb])('addTime correctly sums values', (time, offset) => {
            const result = TimeMath.addTime(time as ContextTime, offset as Seconds);
            expect(result).toBeCloseTo(time + offset);
        });

        test.prop([timeArb, timeArb])('timeSince never returns negative values', (now, pastTime) => {
            const diff = TimeMath.timeSince(now as ContextTime, pastTime as ContextTime);

            expect(diff).toBeGreaterThanOrEqual(0);
            if (now >= pastTime) {
                expect(diff).toBeCloseTo(now - pastTime);
            } else {
                expect(diff).toBe(0);
            }
        });

        test.prop([timeArb, timeArb])('timeUntil never returns negative values', (now, futureTime) => {
            const diff = TimeMath.timeUntil(now as ContextTime, futureTime as ContextTime);

            expect(diff).toBeGreaterThanOrEqual(0);
            if (futureTime >= now) {
                expect(diff).toBeCloseTo(futureTime - now);
            } else {
                expect(diff).toBe(0);
            }
        });
    });

    describe('Type Casting', () => {
        // oxlint-disable-next-line import/no-named-as-default-member
        test.prop([fc.float()])('castToSeconds returns the exact same numeric value', val => {
            expect(TimeMath.castToSeconds(val as ContextTime)).toBe(val);
        });

        // oxlint-disable-next-line import/no-named-as-default-member
        test.prop([fc.float()])('castToContextTime returns the exact same numeric value', val => {
            expect(TimeMath.castToContextTime(val as Seconds)).toBe(val);
        });
    });
});
