import * as execaModule from 'execa';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { generateCodecLadder } from '../ladder.js';
import { generateChunkedStream } from '../stream.js';

const mockFs = vi.hoisted(() => ({
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn()
}));

vi.mock('execa', () => ({
    execa: vi.fn().mockResolvedValue({ stdout: '' })
}));

vi.mock('node:fs', () => ({
    default: mockFs
}));

describe('FFmpeg Pipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFs.existsSync.mockReturnValue(true);
    });

    it('generates codec ladder paths and calls ffmpeg', async () => {
        const result = await generateCodecLadder('dummy.wav', 'out', '/assets');
        expect(result.url.webm).toBe('/assets/dummy.webm');
        expect(result.url.mp3).toBe('/assets/dummy.mp3');
        expect(result.url.m4a).toBe('/assets/dummy.m4a');

        expect(execaModule.execa).toHaveBeenCalledTimes(3);

        expect(execaModule.execa).toHaveBeenCalledWith('ffmpeg', [
            '-v',
            'error',
            '-y',
            '-i',
            'dummy.wav',
            '-vn',
            '-c:a',
            'libopus',
            '-b:a',
            '96k',
            expect.stringContaining('.webm')
        ]);
        expect(execaModule.execa).toHaveBeenCalledWith('ffmpeg', [
            '-v',
            'error',
            '-y',
            '-i',
            'dummy.wav',
            '-vn',
            '-c:a',
            'libmp3lame',
            '-q:a',
            '2',
            expect.stringContaining('.mp3')
        ]);
        expect(execaModule.execa).toHaveBeenCalledWith('ffmpeg', [
            '-v',
            'error',
            '-y',
            '-i',
            'dummy.wav',
            '-vn',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            expect.stringContaining('.m4a')
        ]);

        expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('generates chunked stream manifest and calls ffmpeg', async () => {
        const result = await generateChunkedStream('dummy.wav', 'out', '/assets', 12.0);

        expect(result.chunks.length).toBe(3);

        expect(result.chunks[0].url).toBe('/assets/dummy_000.ogg');
        expect(result.chunks[0].durationSamples).toBe(5 * 44100);
        expect(result.chunks[0].trimStartSamples).toBe(0);

        expect(result.chunks[1].url).toBe('/assets/dummy_001.ogg');
        expect(result.chunks[1].durationSamples).toBe(5 * 44100);
        expect(result.chunks[1].trimStartSamples).toBe(Math.round(0.25 * 44100));

        expect(result.chunks[2].url).toBe('/assets/dummy_002.ogg');
        expect(result.chunks[2].durationSamples).toBe(2 * 44100);
        expect(result.chunks[2].trimStartSamples).toBe(Math.round(0.25 * 44100));

        expect(execaModule.execa).toHaveBeenCalledTimes(3);

        expect(execaModule.execa).toHaveBeenCalledWith('ffmpeg', [
            '-v',
            'error',
            '-y',
            '-ss',
            '0.000',
            '-t',
            '5.250',
            '-i',
            'dummy.wav',
            '-vn',
            '-c:a',
            'libvorbis',
            '-q:a',
            '4',
            '-ar',
            '44100',
            'out\\dummy_000.ogg'.replaceAll('\\', path.sep)
        ]);

        expect(execaModule.execa).toHaveBeenCalledWith('ffmpeg', [
            '-v',
            'error',
            '-y',
            '-ss',
            '4.750',
            '-t',
            '5.500',
            '-i',
            'dummy.wav',
            '-vn',
            '-c:a',
            'libvorbis',
            '-q:a',
            '4',
            '-ar',
            '44100',
            'out\\dummy_001.ogg'.replaceAll('\\', path.sep)
        ]);

        expect(execaModule.execa).toHaveBeenCalledWith('ffmpeg', [
            '-v',
            'error',
            '-y',
            '-ss',
            '9.750',
            '-t',
            '2.500',
            '-i',
            'dummy.wav',
            '-vn',
            '-c:a',
            'libvorbis',
            '-q:a',
            '4',
            '-ar',
            '44100',
            'out\\dummy_002.ogg'.replaceAll('\\', path.sep)
        ]);

        expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('creates output dir if it does not exist (ladder)', async () => {
        mockFs.existsSync.mockReturnValue(false);
        await generateCodecLadder('dummy.wav', 'out', '/assets');
        expect(mockFs.mkdirSync).toHaveBeenCalledWith('out', { recursive: true });
    });

    it('creates output dir if it does not exist (stream)', async () => {
        mockFs.existsSync.mockReturnValue(false);
        await generateChunkedStream('dummy.wav', 'out', '/assets', 5.0);
        expect(mockFs.mkdirSync).toHaveBeenCalledWith('out', { recursive: true });
    });

    it('appends hash suffix to generated stream chunk filenames', async () => {
        const result = await generateChunkedStream('music.wav', 'out', '/assets', 5.0, 44100, '.abc123');
        expect(result.chunks[0].url).toContain('.abc123');
    });

    it('appends hash suffix to generated codec ladder filenames', async () => {
        const result = await generateCodecLadder('music.wav', 'out', '/assets', 2, '.abc123');
        expect(result.url.webm).toBe('/assets/music.abc123.webm');
    });

    it('stream first chunk has trimStartSamples of 0', async () => {
        const result = await generateChunkedStream('dummy.wav', 'out', '/assets', 12.0);
        expect(result.chunks[0].trimStartSamples).toBe(0);
    });

    it('stream subsequent chunks have non-zero trimStartSamples', async () => {
        const result = await generateChunkedStream('dummy.wav', 'out', '/assets', 12.0, 44100);
        expect(result.chunks[1].trimStartSamples).toBe(Math.round(0.25 * 44100));
    });

    it('stream isLooping is always true', async () => {
        const result = await generateChunkedStream('dummy.wav', 'out', '/assets', 5.0);
        expect(result.isLooping).toBe(true);
    });
});
