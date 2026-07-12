import { describe, it, expect } from 'vitest';

import AudioGrid from '../AudioGrid.js';

describe('AudioGrid', () => {
    describe('Initialization & Defaults', () => {
        it('should initialize with provided bpm, default beatsPerBar (4) and startTime (0)', () => {
            const grid = new AudioGrid(60);

            expect(grid.getNextBeatTime(0.5)).toBe(1);
            expect(grid.getNextBarTime(1)).toBe(4);
        });

        it('should respect custom beatsPerBar and startTime', () => {
            const grid = new AudioGrid(60, 3, 10);

            expect(grid.getNextBarTime(11)).toBe(13);
        });
    });

    describe('getNextBeatTime', () => {
        const grid = new AudioGrid(120, 4, 0);

        it('should return the correct next beat time for a standard offset', () => {
            expect(grid.getNextBeatTime(0.2)).toBe(0.5);
            expect(grid.getNextBeatTime(0.6)).toBe(1);
        });

        it('should push to the NEXT beat if currentTime is exactly on a beat boundary (safeElapsed test)', () => {
            expect(grid.getNextBeatTime(1)).toBe(1.5);
        });

        it('should return startTime if currentTime is strictly before the startTime', () => {
            expect(grid.getNextBeatTime(-2)).toBe(0);
        });

        it('should calculate next beat correctly with a custom interval', () => {
            expect(grid.getNextBeatTime(0.2, 3)).toBe(1.5);
            expect(grid.getNextBeatTime(1.6, 3)).toBe(3);
        });
    });

    describe('getNextBarTime', () => {
        const grid = new AudioGrid(120, 4, 5);

        it('should return the correct next bar time for a standard offset', () => {
            expect(grid.getNextBarTime(5.1)).toBe(7);
            expect(grid.getNextBarTime(8.5)).toBe(9);
        });

        it('should push to the NEXT bar if currentTime is exactly on a bar boundary', () => {
            expect(grid.getNextBarTime(7)).toBe(9);
        });

        it('should return startTime if currentTime is strictly before the startTime', () => {
            expect(grid.getNextBarTime(2)).toBe(5);
        });

        it('should calculate next bar correctly with a custom interval', () => {
            expect(grid.getNextBarTime(6, 2)).toBe(9);
            expect(grid.getNextBarTime(10, 2)).toBe(13);
        });
    });

    describe('PPQN & Drift-Free Pulse Math', () => {
        const grid = new AudioGrid(120, 4, 0, 960);

        it('should calculate exact time for a small pulse index without float imprecision', () => {
            expect(grid.getTimeAtPulse(960)).toBe(0.5);
            expect(grid.getTimeAtPulse(480)).toBe(0.25);
        });

        it('should remain drift-free for extremely large pulse indices (e.g. 1 hour of playback)', () => {
            const pulsesInOneHour = 6912000;
            expect(grid.getTimeAtPulse(pulsesInOneHour)).toBe(3600);
        });

        it('should correctly resolve pulse index from an exact timestamp', () => {
            expect(grid.getPulseAtTime(0.5)).toBe(960);
            expect(grid.getPulseAtTime(3600)).toBe(6912000);
        });

        it('should handle pulse calculations with a non-zero startTime offset', () => {
            const offsetGrid = new AudioGrid(120, 4, 5.5, 960);
            expect(offsetGrid.getTimeAtPulse(0)).toBe(5.5);
            expect(offsetGrid.getTimeAtPulse(960)).toBe(6.0);
            expect(offsetGrid.getPulseAtTime(6.0)).toBe(960);
            expect(offsetGrid.getPulseAtTime(2.0)).toBe(0);
        });
    });
});
