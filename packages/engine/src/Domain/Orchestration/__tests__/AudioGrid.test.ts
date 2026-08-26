import type { Beats, BPM, ContextTime, Pulses } from '@scene-grid/shared';

import { describe, it, expect } from 'vitest';

import AudioGrid from '../AudioGrid.js';

describe('AudioGrid', () => {
    describe('Initialization & Defaults', () => {
        it('should initialize with provided bpm, default beatsPerBar (4) and startTime (0)', () => {
            const grid = new AudioGrid(60 as BPM);

            expect(grid.getNextBeatTime(0.5 as ContextTime)).toBe(1);
            expect(grid.getNextBarTime(1 as ContextTime)).toBe(4);
        });

        it('should respect custom beatsPerBar and startTime', () => {
            const grid = new AudioGrid(60 as BPM, 3 as Beats, 10 as ContextTime);

            expect(grid.getNextBarTime(11 as ContextTime)).toBe(13);
        });

        it('should respect custom beatsPerBar and ppqn', () => {
            const grid = new AudioGrid(60 as BPM, 3 as Beats, 10 as ContextTime, 480 as Pulses);

            expect(grid.ppqn).toBe(480);
            expect(grid.beatsPerBar).toBe(3);
        });

        it('should set default beatsPerBar and ppqn', () => {
            const grid = new AudioGrid(120 as BPM);

            expect(grid.ppqn).toBe(AudioGrid.DEFAULT_PPQN);
            expect(grid.beatsPerBar).toBe(AudioGrid.DEFAULT_BEATS_PER_BAR);
        });
    });

    describe('getNextBeatTime', () => {
        const grid = new AudioGrid(120 as BPM, 4 as Beats, 0 as ContextTime);

        it('should return the correct next beat time for a standard offset', () => {
            expect(grid.getNextBeatTime(0.2 as ContextTime)).toBe(0.5);
            expect(grid.getNextBeatTime(0.6 as ContextTime)).toBe(1);
        });

        it('should push to the NEXT beat if currentTime is exactly on a beat boundary (safeElapsed test)', () => {
            expect(grid.getNextBeatTime(1 as ContextTime)).toBe(1.5);
        });

        it('should return startTime if currentTime is strictly before the startTime', () => {
            expect(grid.getNextBeatTime(-2 as ContextTime)).toBe(0);
        });

        it('should calculate next beat correctly with a custom interval', () => {
            expect(grid.getNextBeatTime(0.2 as ContextTime, 3 as Beats)).toBe(1.5);
            expect(grid.getNextBeatTime(1.6 as ContextTime, 3 as Beats)).toBe(3);
        });
    });

    describe('getNextBarTime', () => {
        const grid = new AudioGrid(120 as BPM, 4 as Beats, 5 as ContextTime);

        it('should return the correct next bar time for a standard offset', () => {
            expect(grid.getNextBarTime(5.1 as ContextTime)).toBe(7);
            expect(grid.getNextBarTime(8.5 as ContextTime)).toBe(9);
        });

        it('should push to the NEXT bar if currentTime is exactly on a bar boundary', () => {
            expect(grid.getNextBarTime(7 as ContextTime)).toBe(9);
        });

        it('should return startTime if currentTime is strictly before the startTime', () => {
            expect(grid.getNextBarTime(2 as ContextTime)).toBe(5);
        });

        it('should calculate next bar correctly with a custom interval', () => {
            expect(grid.getNextBarTime(6 as ContextTime, 2)).toBe(9);
            expect(grid.getNextBarTime(10 as ContextTime, 2)).toBe(13);
        });
    });

    describe('PPQN & Drift-Free Pulse Math', () => {
        const grid = new AudioGrid(120 as BPM, 4 as Beats, 0 as ContextTime, 960 as Pulses);

        it('should calculate exact time for a small pulse index without float imprecision', () => {
            expect(grid.getTimeAtPulse(960 as Pulses)).toBe(0.5);
            expect(grid.getTimeAtPulse(480 as Pulses)).toBe(0.25);
        });

        it('should remain drift-free for extremely large pulse indices (e.g. 1 hour of playback)', () => {
            const pulsesInOneHour = 6912000 as Pulses;
            expect(grid.getTimeAtPulse(pulsesInOneHour)).toBe(3600);
        });

        it('should correctly resolve pulse index from an exact timestamp', () => {
            expect(grid.getPulseAtTime(0.5 as ContextTime)).toBe(960);
            expect(grid.getPulseAtTime(3600 as ContextTime)).toBe(6912000);
        });

        it('should handle pulse calculations with a non-zero startTime offset', () => {
            const offsetGrid = new AudioGrid(120 as BPM, 4 as Beats, 5.5 as ContextTime, 960 as Pulses);
            expect(offsetGrid.getTimeAtPulse(0 as Pulses)).toBe(5.5);
            expect(offsetGrid.getTimeAtPulse(960 as Pulses)).toBe(6.0);
            expect(offsetGrid.getPulseAtTime(6.0 as ContextTime)).toBe(960);
            expect(offsetGrid.getPulseAtTime(2.0 as ContextTime)).toBe(0);
        });

        it('should return 0 instantly on exact startTime without falling through to calculation logic (Line 68)', () => {
            const offsetGrid = new AudioGrid(120 as BPM, 4 as Beats, 5.5 as ContextTime, 960 as Pulses);

            let calls = 0;
            const dynamicTime = {
                valueOf() {
                    calls++;
                    if (calls === 1) return 5.5;

                    return 99999;
                }
            } as unknown as ContextTime;

            expect(offsetGrid.getPulseAtTime(dynamicTime)).toBe(0);
        });
    });

    describe('getNextDivisionTime', () => {
        const grid = new AudioGrid(120 as BPM, 4 as Beats, 0 as ContextTime, 960 as Pulses);

        it('should correctly calculate the next 1/4 note division (implicit default fallback)', () => {
            expect(grid.getNextDivisionTime(0.2 as ContextTime, '1/4')).toBe(0.5);
            expect(grid.getNextDivisionTime(0.6 as ContextTime, '1/4')).toBe(1.0);
        });

        it('should correctly calculate the next 1/8 note division', () => {
            expect(grid.getNextDivisionTime(0.1 as ContextTime, '1/8')).toBe(0.25);
            expect(grid.getNextDivisionTime(0.3 as ContextTime, '1/8')).toBe(0.5);
        });

        it('should correctly calculate the next 1/16 note division', () => {
            expect(grid.getNextDivisionTime(0.1 as ContextTime, '1/16')).toBe(0.125);
            expect(grid.getNextDivisionTime(0.15 as ContextTime, '1/16')).toBe(0.25);
        });

        it('should correctly calculate the next 1/32 note division', () => {
            expect(grid.getNextDivisionTime(0.05 as ContextTime, '1/32')).toBe(0.0625);
            expect(grid.getNextDivisionTime(0.1 as ContextTime, '1/32')).toBe(0.125);
        });

        it('should strictly push to the NEXT division if currentTime is exactly on a boundary (+1 pulse safe zone)', () => {
            expect(grid.getNextDivisionTime(0.25 as ContextTime, '1/8')).toBe(0.5);
            expect(grid.getNextDivisionTime(0.125 as ContextTime, '1/16')).toBe(0.25);
        });

        it('should handle pre-roll (currentTime strictly before startTime) properly', () => {
            expect(grid.getNextDivisionTime(-2.0 as ContextTime, '1/8')).toBe(0.25);
            expect(grid.getNextDivisionTime(-0.5 as ContextTime, '1/16')).toBe(0.125);
        });
    });
});
