import * as execaModule from 'execa';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { generateCodecLadder } from '../ladder.js';
import { generateChunkedStream } from '../stream.js';

vi.mock('execa', () => ({
    execa: vi.fn().mockResolvedValue({ stdout: '' })
}));
vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn()
    }
}));

describe('FFmpeg Pipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('generates codec ladder paths and calls ffmpeg', async () => {
        const result = await generateCodecLadder('dummy.wav', 'out', '/assets');
        expect(result.url.webm).toBe('/assets/dummy.webm');
        expect(execaModule.execa).toHaveBeenCalledTimes(3);
    });

    it('generates chunked stream manifest and calls ffmpeg', async () => {
        const result = await generateChunkedStream('dummy.wav', 'out', '/assets', 12.0);
        expect(result.chunks.length).toBe(3);
        expect(result.chunks[0].url).toBe('/assets/dummy_000.ogg');
        expect(execaModule.execa).toHaveBeenCalledTimes(3);
    });
});
