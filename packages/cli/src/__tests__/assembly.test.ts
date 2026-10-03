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
    generateCodecLadder: vi
        .fn()
        .mockImplementation(
            async (inputPath: string, _dir: string, baseUrl: string, _c: number, hashSuffix: string = '') => {
                const basename = require('node:path').basename(inputPath, require('node:path').extname(inputPath));
                return { url: { webm: `${baseUrl}/${basename}${hashSuffix}.webm` } };
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
        mockFs.readdirSync.mockReturnValue([
            'dummy2.mp3',
            'dummy3.ogg',
            'dummy6.m4a',
            'dummy4.flac',
            'dummy1.wav',
            'dummy5.aiff'
        ]);

        await processAssets(DEFAULT_PROCESS_OPTS);

        expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2);

        // Assert sorting, contents, and newline at EOF
        const sizesJsonStr = mockFs.writeFileSync.mock.calls[0][1];
        expect(sizesJsonStr).toMatch(/\n$/);
        // Keys must be alphabetically sorted
        expect(sizesJsonStr.indexOf('dummy1')).toBeLessThan(sizesJsonStr.indexOf('dummy2'));
        expect(sizesJsonStr.indexOf('dummy2')).toBeLessThan(sizesJsonStr.indexOf('dummy3'));

        const sizesJson = JSON.parse(sizesJsonStr);
        expect(sizesJson).toEqual({
            dummy1: 20,
            dummy2: 20,
            dummy3: 20,
            dummy4: 20,
            dummy5: 20,
            dummy6: 20
        });

        const manifestJsonStr = mockFs.writeFileSync.mock.calls[1][1];
        expect(manifestJsonStr).toMatch(/\n$/);

        const payload = mockValidate.mock.calls[0][0];
        expect(payload.manifest.dummy1.priority).toBe('high');

        expect(mockValidate).toHaveBeenCalledWith(
            expect.objectContaining({
                precalculatedSizes: {
                    '/assets/dummy1.webm': 20,
                    '/assets/dummy2.webm': 20,
                    '/assets/dummy3.webm': 20,
                    '/assets/dummy4.webm': 20,
                    '/assets/dummy5.webm': 20,
                    '/assets/dummy6.webm': 20
                },
                ramQuotaMb: 50.0,
                buses: { master: { volume: 1, routing: [] } },
                banks: {
                    main: {
                        isPreloaded: true,
                        type: 'Memory',
                        sounds: ['dummy1', 'dummy2', 'dummy3', 'dummy4', 'dummy5', 'dummy6']
                    }
                }
            }),
            { isReturnWithReport: true }
        );

        expect(mockFs.mkdirSync).not.toHaveBeenCalled();
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
        mockFs.readdirSync.mockReturnValue(['dummy.wav']);

        await processAssets({ ...DEFAULT_PROCESS_OPTS, aliases: 'aliases.json' });

        expect(mockFs.readFileSync).toHaveBeenCalledWith('aliases.json', 'utf-8');

        const manifestContent = JSON.parse(mockFs.writeFileSync.mock.calls[1][1]);
        expect(Object.keys(manifestContent)).toContain('placeholder1');
        expect(manifestContent['placeholder1'].url).toEqual(['/assets/dummy.webm']);

        expect(mockValidate).toHaveBeenCalledWith(
            expect.objectContaining({
                soundMap: {
                    placeholder1: { busId: 'master', bankId: 'main', manifestId: 'placeholder1' }
                }
            }),
            expect.anything()
        );
    });

    it('supports multiple logical IDs mapped to the same physical file', async () => {
        const aliasMap = { sound_a: 'dummy', sound_b: 'dummy' };
        mockFs.readFileSync.mockReturnValue(JSON.stringify(aliasMap));
        mockFs.readdirSync.mockReturnValue(['dummy.wav']);

        await processAssets({ ...DEFAULT_PROCESS_OPTS, aliases: 'aliases.json' });

        const soundManifestCall = mockFs.writeFileSync.mock.calls.find((c: any[]) =>
            String(c[0]).includes('sound-manifest')
        );
        const manifestContent = JSON.parse(soundManifestCall![1] as string);
        expect(Object.keys(manifestContent)).toContain('sound_a');
        expect(Object.keys(manifestContent)).toContain('sound_b');
    });

    it('logs warning when aliases file is specified but not found', async () => {
        mockFs.existsSync.mockImplementation((p: string) => !p.includes('aliases'));
        mockFs.readdirSync.mockReturnValue(['dummy.wav']);

        await processAssets({ ...DEFAULT_PROCESS_OPTS, aliases: 'missing-aliases.json' });

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Aliases file not found'));
    });

    it('routes to chunk strategy when PCM size exceeds quota', async () => {
        (pcmModule.calculatePCMSize as ReturnType<typeof vi.fn>).mockReturnValue(20.0);
        const { generateChunkedStream } = await import('../stream.js');
        mockFs.readdirSync.mockReturnValue(['dummy.wav']);

        await processAssets({ ...DEFAULT_PROCESS_OPTS, quotaMb: 10.0 });

        expect(generateChunkedStream).toHaveBeenCalled();

        const payload = mockValidate.mock.calls[0][0];
        expect(payload.precalculatedSizes).toEqual({});
        expect(payload.manifest.dummy.url).toEqual('/assets/dummy.json');

        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
            expect.stringMatching(/dummy\.json$/),
            expect.stringMatching(/\n$/)
        );
    });

    it('routes to ladder strategy when PCM size is below quota', async () => {
        (pcmModule.calculatePCMSize as ReturnType<typeof vi.fn>).mockReturnValue(5.0);
        const { generateCodecLadder } = await import('../ladder.js');
        mockFs.readdirSync.mockReturnValue(['dummy.wav']);

        await processAssets({ ...DEFAULT_PROCESS_OPTS, quotaMb: 10.0 });

        expect(generateCodecLadder).toHaveBeenCalled();
    });

    it('strips trailing slash from baseUrl when constructing sound map entries', async () => {
        (pcmModule.calculatePCMSize as ReturnType<typeof vi.fn>).mockReturnValue(20.0);
        mockFs.readdirSync.mockReturnValue(['dummy.wav']);

        await processAssets({ ...DEFAULT_PROCESS_OPTS, baseUrl: '/assets/', quotaMb: 10.0 });

        const soundManifestCall = mockFs.writeFileSync.mock.calls.find((c: any[]) =>
            String(c[0]).includes('sound-manifest')
        );
        const manifestContent = JSON.parse(soundManifestCall![1] as string);
        const firstEntry = Object.values(manifestContent)[0] as any;
        expect(firstEntry.url).toEqual('/assets/dummy.json');
    });

    it('uses streamPriority low for chunk-routed assets', async () => {
        (pcmModule.calculatePCMSize as ReturnType<typeof vi.fn>).mockReturnValue(20.0);
        mockFs.readdirSync.mockReturnValue(['dummy.wav']);

        await processAssets({ ...DEFAULT_PROCESS_OPTS, quotaMb: 10.0, streamPriority: 'low' });

        const soundManifestCall = mockFs.writeFileSync.mock.calls.find((c: any[]) =>
            String(c[0]).includes('sound-manifest')
        );
        expect(soundManifestCall).toBeDefined();
        expect(soundManifestCall![1]).toMatch(/\n$/);

        const manifestContent = JSON.parse(soundManifestCall![1] as string);
        const firstEntry = Object.values(manifestContent)[0] as any;
        expect(firstEntry.priority).toBe('low');
    });

    it('appends hash suffix when hash: true', async () => {
        const { EventEmitter } = await import('node:events');
        mockFs.readdirSync.mockReturnValue(['dummy.wav']);

        mockFs.createReadStream.mockImplementation(() => {
            const fakeStream = new EventEmitter() as any;
            setImmediate(() => {
                fakeStream.emit('data', Buffer.from('audio-data'));
                fakeStream.emit('end');
            });
            return fakeStream;
        });

        await processAssets({ ...DEFAULT_PROCESS_OPTS, hash: true });

        const expectedHash = require('crypto').createHash('md5').update('audio-data').digest('hex').slice(0, 6);
        expect(mockValidate).toHaveBeenCalledWith(
            expect.objectContaining({
                precalculatedSizes: {
                    [`/assets/dummy.${expectedHash}.webm`]: 20
                }
            }),
            expect.anything()
        );
    });

    it('rejects when createReadStream emits an error', async () => {
        const { EventEmitter } = await import('node:events');
        mockFs.readdirSync.mockReturnValue(['dummy.wav']);

        mockFs.createReadStream.mockImplementation(() => {
            const fakeStream = new EventEmitter() as any;
            setImmediate(() => {
                fakeStream.emit('error', new Error('disk read failure'));
            });
            return fakeStream;
        });

        const promise = processAssets({ ...DEFAULT_PROCESS_OPTS, hash: true });

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
        mockFs.readdirSync.mockReturnValue([
            'sound1.wav',
            'sound2.mp3',
            'sound3.ogg',
            'sound4.flac',
            'sound5.aiff',
            'sound6.m4a',
            'notes.txt'
        ]);
        await prepareAliases('input', 'aliases.json');

        expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
        const writtenStr = mockFs.writeFileSync.mock.calls[0][1] as string;
        expect(writtenStr).toMatch(/\n$/);

        const written = JSON.parse(writtenStr);
        expect(Object.keys(written)).toHaveLength(6);
        expect(written['placeholder1']).toBe('sound1');
        expect(written['placeholder2']).toBe('sound2');
        expect(written['placeholder3']).toBe('sound3');
        expect(written['placeholder4']).toBe('sound4');
        expect(written['placeholder5']).toBe('sound5');
        expect(written['placeholder6']).toBe('sound6');
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
