import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFs = vi.hoisted(() => ({
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue(['fx_boom.wav']),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
    createReadStream: vi.fn()
}));

vi.mock('../pcm.js', () => ({
    extractMetadata: vi.fn().mockResolvedValue({ durationSec: 10, channels: 2, sampleRate: 44100 }),
    calculatePCMSize: vi.fn().mockReturnValue(8.0)
}));

vi.mock('../ladder.js', () => ({
    generateCodecLadder: vi
        .fn()
        .mockImplementation(
            async (inputPath: string, _dir: string, baseUrl: string, _c: number, hashSuffix: string = '') => {
                const basename = require('node:path').basename(inputPath, require('node:path').extname(inputPath));
                return {
                    url: {
                        webm: `${baseUrl}/${basename}${hashSuffix}.webm`,
                        mp3: `${baseUrl}/${basename}${hashSuffix}.mp3`,
                        m4a: `${baseUrl}/${basename}${hashSuffix}.m4a`
                    }
                };
            }
        )
}));

vi.mock('../stream.js', () => ({
    generateChunkedStream: vi
        .fn()
        .mockImplementation(
            async (
                inputPath: string,
                _dir: string,
                baseUrl: string,
                _dur: number,
                _sr: number,
                hashSuffix: string = ''
            ) => {
                const basename = require('node:path').basename(inputPath, require('node:path').extname(inputPath));
                return { chunks: [{ url: `${baseUrl}/${basename}${hashSuffix}_000.ogg` }] };
            }
        )
}));

vi.mock('node:fs', () => ({
    default: mockFs
}));

import { EventEmitter } from 'node:events';

import * as pcmModule from '../pcm.js';
import { processAssets } from '../pipeline.js';

describe('Pipeline Real ConsistencyChecker Self-Check', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue(['fx_boom.wav', 'bgm_long.wav']);
        mockFs.readFileSync.mockReturnValue('{}');
        mockFs.createReadStream.mockImplementation(() => {
            const fakeStream = new EventEmitter() as any;
            setImmediate(() => {
                fakeStream.emit('data', Buffer.from('audio-data'));
                fakeStream.emit('end');
            });
            return fakeStream;
        });
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('passes real ConsistencyChecker validation for ladder and chunk-routed assets', async () => {
        vi.mocked(pcmModule.calculatePCMSize)
            .mockReturnValueOnce(4.0) // fx_boom -> ladder
            .mockReturnValueOnce(20.0); // bgm_long -> chunk

        await processAssets({
            inputDir: 'input',
            outputDir: 'output',
            manifestsDir: 'manifests',
            baseUrl: '/assets',
            quotaMb: 10.0,
            streamRules: [],
            streamExclusions: [],
            streamPriority: 'high',
            hash: true
        });

        expect(console.error).not.toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('Consistency Check reported errors'));
        expect(console.log).toHaveBeenCalledWith('\nConsistency Check Passed!');
    });

    it('detects RAM Quota Breach via real RamQuotaRule when precalculatedSizes exceeds quotaMb', async () => {
        mockFs.readdirSync.mockReturnValue(['fx_heavy.wav']);
        vi.mocked(pcmModule.calculatePCMSize).mockReturnValueOnce(12.0);

        await processAssets({
            inputDir: 'input',
            outputDir: 'output',
            manifestsDir: 'manifests',
            baseUrl: '/assets',
            quotaMb: 8.0,
            streamRules: [],
            streamExclusions: ['fx_heavy'],
            streamPriority: 'high',
            hash: false
        });

        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('RAM Quota Breach: High-priority sounds consume 12.0 MB')
        );
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Consistency Check reported errors'));
    });
});
