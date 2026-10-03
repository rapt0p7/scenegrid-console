import * as execaModule from 'execa';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { calculatePCMSize, extractMetadata } from '../pcm.js';

vi.mock('execa', () => ({
    execa: vi.fn()
}));

const mockExeca = execaModule.execa as ReturnType<typeof vi.fn>;

describe('PCM Calculation', () => {
    it('calculates the exact PCM size in MB for stereo 44.1kHz audio', () => {
        const size1 = calculatePCMSize(1, 2, 44100);
        expect(size1).toBeCloseTo(352800 / 1024 / 1024, 4);

        const size42 = calculatePCMSize(42.5, 2, 44100);
        expect(size42).toBeCloseTo((352800 * 42.5) / 1024 / 1024, 4);
    });

    it('handles zero duration', () => {
        expect(calculatePCMSize(0, 2, 44100)).toBe(0);
    });

    it('handles mono audio', () => {
        const size = calculatePCMSize(1, 1, 44100);
        expect(size).toBeCloseTo((44100 * 1 * 4) / 1024 / 1024, 4);
    });
});

describe('extractMetadata', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('parses ffprobe JSON output into AudioMetadata', async () => {
        const ffprobeOutput = {
            format: { duration: '10.5' },
            streams: [{ channels: 2, sample_rate: '44100' }]
        };
        mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify(ffprobeOutput) });

        const meta = await extractMetadata('/path/to/audio.wav');

        expect(meta.durationSec).toBe(10.5);
        expect(meta.channels).toBe(2);
        expect(meta.sampleRate).toBe(44100);

        expect(mockExeca).toHaveBeenCalledWith('ffprobe', [
            '-v',
            'error',
            '-show_entries',
            'format=duration:stream=channels,sample_rate',
            '-of',
            'json',
            '/path/to/audio.wav'
        ]);
    });

    it('defaults channels to 0 when not present in stream', async () => {
        const ffprobeOutput = {
            format: { duration: '5.0' },
            streams: [{ sample_rate: '22050' }]
        };
        mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify(ffprobeOutput) });

        const meta = await extractMetadata('/path/to/mono.wav');
        expect(meta.channels).toBe(0);
        expect(meta.sampleRate).toBe(22050);
    });

    it('defaults sampleRate to 0 when not present in stream', async () => {
        const ffprobeOutput = {
            format: { duration: '3.0' },
            streams: [{ channels: 1 }]
        };
        mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify(ffprobeOutput) });

        const meta = await extractMetadata('/path/to/audio.wav');
        expect(meta.sampleRate).toBe(0);
    });

    it('throws when format.duration is missing', async () => {
        const ffprobeOutput = {
            format: {},
            streams: [{ channels: 2, sample_rate: '44100' }]
        };
        mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify(ffprobeOutput) });

        await expect(extractMetadata('/path/to/bad.wav')).rejects.toThrow(
            'Failed to parse valid metadata from ffprobe output for /path/to/bad.wav'
        );
    });

    it('throws when format object is completely missing', async () => {
        const ffprobeOutput = {
            streams: [{ channels: 2, sample_rate: '44100' }]
        };
        mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify(ffprobeOutput) });

        await expect(extractMetadata('/path/to/bad.wav')).rejects.toThrow(
            'Failed to parse valid metadata from ffprobe output for /path/to/bad.wav'
        );
    });

    it('throws when streams array is empty', async () => {
        const ffprobeOutput = {
            format: { duration: '10.0' },
            streams: []
        };
        mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify(ffprobeOutput) });

        await expect(extractMetadata('/path/to/bad.wav')).rejects.toThrow(
            'Failed to parse valid metadata from ffprobe output for /path/to/bad.wav'
        );
    });

    it('throws when streams array is completely missing', async () => {
        const ffprobeOutput = {
            format: { duration: '10.0' }
        };
        mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify(ffprobeOutput) });

        await expect(extractMetadata('/path/to/bad.wav')).rejects.toThrow(
            'Failed to parse valid metadata from ffprobe output for /path/to/bad.wav'
        );
    });
});
