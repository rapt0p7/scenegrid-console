import fs from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import * as pcmModule from '../pcm.js';
import { processAssets } from '../pipeline.js';

vi.mock('../pcm.js', () => ({
    extractMetadata: vi.fn().mockResolvedValue({ durationSec: 10, channels: 2, sampleRate: 44100 }),
    calculatePCMSize: vi.fn().mockReturnValue(20.0)
}));

vi.mock('../ladder.js', () => ({
    generateCodecLadder: vi.fn().mockResolvedValue({ url: { webm: '/assets/dummy.webm' } })
}));

vi.mock('../stream.js', () => ({
    generateChunkedStream: vi.fn().mockResolvedValue({ chunks: [{ url: '/assets/dummy_000.ogg' }] })
}));

vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn(),
        readdirSync: vi.fn().mockReturnValue(['dummy.wav']),
        writeFileSync: vi.fn()
    }
}));
const mockValidate = vi.fn();
vi.mock('@scene-grid/engine', () => {
    return {
        ConsistencyChecker: {
            validate: (...args: any[]) => mockValidate(...args)
        }
    };
});

describe('Pipeline Assembly', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockValidate.mockReturnValue([true, { errors: [], warnings: [] }]);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('processes assets and writes discrete JSON files', async () => {
        await processAssets({
            inputDir: 'input',
            outputDir: 'output',
            manifestsDir: 'manifests',
            baseUrl: '/assets',
            quotaMb: 50.0,
            streamRules: [],
            streamExclusions: [],
            streamPriority: 'high',
            hash: false
        });

        expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
        const calls = (fs.writeFileSync as any).mock.calls;

        expect(calls[0][0]).toContain('audio-sizes.json');
        expect(calls[1][0]).toContain('sound-manifest.json');
    });

    it('warns if quota is breached without throwing', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        (pcmModule.calculatePCMSize as any).mockReturnValueOnce(14.0);
        mockValidate.mockReturnValueOnce([false, { errors: ['Quota breached'], warnings: [] }]);

        await processAssets({
            inputDir: 'input',
            outputDir: 'output',
            manifestsDir: 'manifests',
            baseUrl: '/assets',
            quotaMb: 10.0,
            streamRules: [],
            streamExclusions: [],
            streamPriority: 'high',
            hash: false
        });

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Consistency Check reported errors'));
    });
});
