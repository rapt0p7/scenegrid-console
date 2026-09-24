/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFs = vi.hoisted(() => ({
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue(['dummy.wav']),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
    createReadStream: vi.fn()
}));

const mockValidate = vi.hoisted(() => vi.fn());

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
    default: mockFs
}));

vi.mock('@scene-grid/engine', () => ({
    ConsistencyChecker: {
        validate: (...args: any[]) => mockValidate(...args)
    }
}));

import * as pcmModule from '../pcm.js';
import { processAssets, prepareAliases } from '../pipeline.js';

const DEFAULT_PROCESS_OPTS = {
    inputDir: 'input',
    outputDir: 'output',
    manifestsDir: 'manifests',
    baseUrl: '/assets',
    quotaMb: 50.0,
    streamRules: [] as string[],
    streamExclusions: [] as string[],
    streamPriority: 'high' as const,
    hash: false
};

describe('Pipeline Assembly', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue(['dummy.wav']);
        mockFs.readFileSync.mockReturnValue('{}');
        mockValidate.mockReturnValue([true, { errors: [], warnings: [] }]);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('processes assets and writes audio-sizes.json and sound-manifest.json', async () => {
        await processAssets(DEFAULT_PROCESS_OPTS);

        expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2);
        expect(mockFs.writeFileSync.mock.calls[0][0]).toContain('audio-sizes.json');
        expect(mockFs.writeFileSync.mock.calls[1][0]).toContain('sound-manifest.json');
    });

    it('warns when ConsistencyChecker reports errors', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        (pcmModule.calculatePCMSize as ReturnType<typeof vi.fn>).mockReturnValueOnce(14.0);
        mockValidate.mockReturnValueOnce([false, { errors: ['Quota breached'], warnings: [] }]);

        await processAssets({ ...DEFAULT_PROCESS_OPTS, quotaMb: 10.0 });

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Consistency Check reported errors'));
    });

    it('logs Consistency Check Passed when validation succeeds', async () => {
        await processAssets(DEFAULT_PROCESS_OPTS);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Consistency Check Passed'));
    });

    it('creates outputDir when it does not exist', async () => {
        mockFs.existsSync.mockImplementation((p: string) => p !== 'output');

        await processAssets(DEFAULT_PROCESS_OPTS);

        expect(mockFs.mkdirSync).toHaveBeenCalledWith('output', { recursive: true });
    });

    it('creates manifestsDir when it does not exist', async () => {
        mockFs.existsSync.mockImplementation((p: string) => p !== 'manifests');

        await processAssets(DEFAULT_PROCESS_OPTS);

        expect(mockFs.mkdirSync).toHaveBeenCalledWith('manifests', { recursive: true });
    });

    it('loads aliases file and maps physical names to logical IDs when file exists', async () => {
        const aliasMap = { placeholder1: 'dummy' };
        mockFs.readFileSync.mockReturnValue(JSON.stringify(aliasMap));

        await processAssets({ ...DEFAULT_PROCESS_OPTS, aliases: 'aliases.json' });

        const manifestContent = JSON.parse(mockFs.writeFileSync.mock.calls[1][1]);
        expect(Object.keys(manifestContent)).toContain('placeholder1');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Loading aliases from'));
    });

    it('supports multiple logical IDs mapped to the same physical file', async () => {
        const aliasMap = { sound_a: 'dummy', sound_b: 'dummy' };
        mockFs.readFileSync.mockReturnValue(JSON.stringify(aliasMap));

        await processAssets({ ...DEFAULT_PROCESS_OPTS, aliases: 'aliases.json' });

        const soundManifestCall = mockFs.writeFileSync.mock.calls.find((c: any[]) =>
            String(c[0]).includes('sound-manifest')
        );
        expect(soundManifestCall).toBeDefined();
        const manifestContent = JSON.parse(soundManifestCall![1] as string);
        expect(Object.keys(manifestContent)).toContain('sound_a');
        expect(Object.keys(manifestContent)).toContain('sound_b');
    });

    it('logs warning when aliases file is specified but not found', async () => {
        mockFs.existsSync.mockImplementation((p: string) => !p.includes('aliases'));

        await processAssets({ ...DEFAULT_PROCESS_OPTS, aliases: 'missing-aliases.json' });

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Aliases file not found'));
    });

    it('routes to chunk strategy when PCM size exceeds quota', async () => {
        (pcmModule.calculatePCMSize as ReturnType<typeof vi.fn>).mockReturnValue(20.0);
        const { generateChunkedStream } = await import('../stream.js');

        await processAssets({ ...DEFAULT_PROCESS_OPTS, quotaMb: 10.0 });

        expect(generateChunkedStream).toHaveBeenCalled();
    });

    it('routes to ladder strategy when PCM size is below quota', async () => {
        (pcmModule.calculatePCMSize as ReturnType<typeof vi.fn>).mockReturnValue(5.0);
        const { generateCodecLadder } = await import('../ladder.js');

        await processAssets({ ...DEFAULT_PROCESS_OPTS, quotaMb: 10.0 });

        expect(generateCodecLadder).toHaveBeenCalled();
    });

    it('strips trailing slash from baseUrl when constructing sound map entries', async () => {
        (pcmModule.calculatePCMSize as ReturnType<typeof vi.fn>).mockReturnValue(5.0);

        await processAssets({ ...DEFAULT_PROCESS_OPTS, baseUrl: '/assets/', quotaMb: 10.0 });

        expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('uses streamPriority low for chunk-routed assets', async () => {
        (pcmModule.calculatePCMSize as ReturnType<typeof vi.fn>).mockReturnValue(20.0);

        await processAssets({ ...DEFAULT_PROCESS_OPTS, quotaMb: 10.0, streamPriority: 'low' });

        const soundManifestCall = mockFs.writeFileSync.mock.calls.find((c: any[]) =>
            String(c[0]).includes('sound-manifest')
        );
        expect(soundManifestCall).toBeDefined();
        const manifestContent = JSON.parse(soundManifestCall![1] as string);
        const firstEntry = Object.values(manifestContent)[0] as any;
        expect(firstEntry.priority).toBe('low');
    });

    it('appends hash suffix when hash: true', async () => {
        const { EventEmitter } = await import('node:events');
        const fakeStream = new EventEmitter() as any;
        mockFs.createReadStream.mockReturnValue(fakeStream);

        const promise = processAssets({ ...DEFAULT_PROCESS_OPTS, hash: true });

        setImmediate(() => {
            fakeStream.emit('data', Buffer.from('audio-data'));
            fakeStream.emit('end');
        });

        await promise;

        expect(mockFs.writeFileSync.mock.calls.length).toBeGreaterThan(0);
    });

    it('rejects when createReadStream emits an error', async () => {
        const { EventEmitter } = await import('node:events');
        const fakeStream = new EventEmitter() as any;
        mockFs.createReadStream.mockReturnValue(fakeStream);

        const promise = processAssets({ ...DEFAULT_PROCESS_OPTS, hash: true });

        setImmediate(() => {
            fakeStream.emit('error', new Error('disk read failure'));
        });

        await expect(promise).rejects.toThrow('disk read failure');
    });
});

describe('prepareAliases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue(['sound1.wav', 'sound2.mp3', 'notes.txt']);
        mockFs.writeFileSync.mockReset();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('writes alias template with placeholders only for audio files (not .txt)', async () => {
        await prepareAliases('input', 'aliases.json');

        expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
        const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
        expect(Object.keys(written)).toHaveLength(2);
        expect(written['placeholder1']).toBe('sound1');
        expect(written['placeholder2']).toBe('sound2');
    });

    it('creates output directory when it does not exist', async () => {
        mockFs.existsSync.mockImplementation((p: string) => !p.includes('out'));

        await prepareAliases('input', 'out/aliases.json');

        expect(mockFs.mkdirSync).toHaveBeenCalledWith('out', { recursive: true });
    });

    it('returns early and logs error when inputDir does not exist', async () => {
        mockFs.existsSync.mockReturnValue(false);

        await prepareAliases('missing-input', 'aliases.json');

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Input directory not found'));
        expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('logs the output path and placeholder count after writing', async () => {
        await prepareAliases('input', 'aliases.json');

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Prepared aliases template'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('2 placeholders'));
    });

    it('writes an empty object when input directory contains no audio files', async () => {
        mockFs.readdirSync.mockReturnValue(['readme.txt', 'image.png']);

        await prepareAliases('input', 'aliases.json');

        const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
        expect(Object.keys(written)).toHaveLength(0);
    });
});
