import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockResolveConfig = vi.hoisted(() =>
    vi.fn().mockResolvedValue({
        input: './raw-assets',
        output: './assets',
        manifests: './configs',
        baseUrl: '/assets',
        quotaMb: 15,
        streamRules: [],
        streamExclusions: [],
        streamPriority: 'high',
        hash: false,
        aliases: undefined
    })
);

const mockProcessAssets = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockPrepareAliases = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('../config.js', () => ({ resolveConfig: mockResolveConfig }));
vi.mock('../pipeline.js', () => ({
    processAssets: mockProcessAssets,
    prepareAliases: mockPrepareAliases
}));
vi.mock('../pcm.js', () => ({
    extractMetadata: vi.fn(),
    calculatePCMSize: vi.fn()
}));
const mockExecSync = vi.hoisted(() => vi.fn().mockReturnValue(Buffer.from('')));
vi.mock('node:child_process', () => ({
    execSync: mockExecSync
}));
vi.mock('../router.js', () => ({ routeAsset: vi.fn() }));

import { main, processAssets, prepareAliases, extractMetadata, calculatePCMSize, routeAsset } from '../index.js';

describe('index.ts re-exports', () => {
    it('re-exports processAssets and prepareAliases from pipeline', () => {
        expect(typeof processAssets).toBe('function');
        expect(typeof prepareAliases).toBe('function');
    });

    it('re-exports extractMetadata and calculatePCMSize from pcm', () => {
        expect(typeof extractMetadata).toBe('function');
        expect(typeof calculatePCMSize).toBe('function');
    });

    it('re-exports routeAsset from router', () => {
        expect(typeof routeAsset).toBe('function');
    });
});

describe('main() — normal pipeline flow', () => {
    let originalArgv: string[];

    beforeEach(() => {
        originalArgv = [...process.argv];
        vi.clearAllMocks();
        mockResolveConfig.mockResolvedValue({
            input: './raw-assets',
            output: './assets',
            manifests: './configs',
            baseUrl: '/assets',
            quotaMb: 15,
            streamRules: [],
            streamExclusions: [],
            streamPriority: 'high',
            hash: false,
            aliases: undefined
        });
        mockProcessAssets.mockResolvedValue(null);
        mockPrepareAliases.mockResolvedValue(null);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.argv = originalArgv;
        vi.restoreAllMocks();
    });

    it('resolves config and calls processAssets with resolved paths', async () => {
        process.argv = ['node', 'index.js'];

        await main();

        expect(mockResolveConfig).toHaveBeenCalledWith(process.argv);
        expect(mockProcessAssets).toHaveBeenCalledWith({
            inputDir: path.resolve('./raw-assets'),
            outputDir: path.resolve('./assets'),
            manifestsDir: path.resolve('./configs'),
            baseUrl: '/assets',
            quotaMb: 15,
            streamRules: [],
            streamExclusions: [],
            streamPriority: 'high',
            hash: false,
            aliases: undefined
        });
    });

    it('logs pipeline started and finished messages', async () => {
        process.argv = ['node', 'index.js'];

        await main();

        expect(console.log).toHaveBeenCalledWith('Starting SceneGrid CLI Asset Pipeline');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Input: '));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Audio Output: '));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Manifests Output: '));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Base URL: '));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('RAM Quota: '));
        expect(console.log).toHaveBeenCalledWith('Pipeline finished successfully!');
    });

    it('logs error and calls process.exit(1) when processAssets throws', async () => {
        process.argv = ['node', 'index.js'];
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
        mockProcessAssets.mockRejectedValueOnce(new Error('ffmpeg failed'));

        await main();

        expect(console.error).toHaveBeenCalledWith('CLI execution failed:', expect.any(Error));
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});

describe('main() — init-aliases sub-command', () => {
    let originalArgv: string[];

    beforeEach(() => {
        originalArgv = [...process.argv];
        vi.clearAllMocks();
        mockPrepareAliases.mockResolvedValue(null);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.argv = originalArgv;
        vi.restoreAllMocks();
    });

    it('calls prepareAliases with default paths when no --input/--output flags', async () => {
        process.argv = ['node', 'index.js', 'init-aliases'];

        await main();

        expect(mockPrepareAliases).toHaveBeenCalledWith(path.resolve('./raw-assets'), path.resolve('./aliases.json'));
        expect(mockProcessAssets).not.toHaveBeenCalled();
    });

    it('calls prepareAliases with custom paths when --input and --output are provided', async () => {
        process.argv = ['init-aliases', '--output', './my-aliases.json', '--input', './my-sounds'];
        await main();
        expect(mockPrepareAliases).toHaveBeenCalledWith(path.resolve('./my-sounds'), path.resolve('./my-aliases.json'));

        mockPrepareAliases.mockClear();

        process.argv = ['init-aliases', '--input', './my-sounds2', '--output', './my-aliases2.json'];
        await main();
        expect(mockPrepareAliases).toHaveBeenCalledWith(
            path.resolve('./my-sounds2'),
            path.resolve('./my-aliases2.json')
        );
    });

    describe('generate-schemas command', () => {
        it('calls the underlying generator script', async () => {
            process.argv = ['node', 'index.js', 'generate-schemas'];

            await main();

            expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('npm run generate-schema'), {
                stdio: 'inherit'
            });
            expect(console.log).toHaveBeenCalledWith('Generating JSON schemas...');
        });
    });
});

describe('isMain execution', () => {
    let originalArgv: string[];

    beforeEach(() => {
        originalArgv = [...process.argv];
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.argv = originalArgv;
        vi.restoreAllMocks();
    });

    it('executes main when isMain is true (top-level execution) and handles errors', async () => {
        vi.resetModules();
        const indexPath = require('node:fs').realpathSync(path.resolve(__dirname, '../index.ts'));
        process.argv = ['node', indexPath, 'invalid-command-to-cause-error'];

        vi.doMock('../config.js', () => ({
            resolveConfig: vi.fn().mockRejectedValue(new Error('config error'))
        }));
        vi.doMock('../pipeline.js', () => ({
            processAssets: vi.fn(),
            prepareAliases: vi.fn()
        }));

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await import('../index.js');

        await new Promise(r => setTimeout(r, 50));

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(errorSpy).toHaveBeenCalled();
    });

    it('executes main when isMain is true and exits normally on success', async () => {
        vi.resetModules();
        const indexPath = require('node:fs').realpathSync(path.resolve(__dirname, '../index.ts'));
        process.argv = ['node', indexPath, 'init-aliases'];

        vi.doMock('../pipeline.js', () => ({
            processAssets: vi.fn(),
            prepareAliases: vi.fn().mockResolvedValue(null)
        }));
        vi.doMock('../config.js', () => ({
            resolveConfig: vi.fn().mockResolvedValue({})
        }));

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

        await import('../index.js');
        await new Promise(r => setTimeout(r, 50));

        expect(exitSpy).not.toHaveBeenCalled();
    });
});

describe('isMain execution - edge cases', () => {
    let originalArgv: string[];

    beforeEach(() => {
        originalArgv = [...process.argv];
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.argv = originalArgv;
        vi.restoreAllMocks();
    });

    it('does not execute main if process.argv[1] is missing', async () => {
        vi.resetModules();
        process.argv = ['node'];

        vi.doMock('../pipeline.js', () => ({
            processAssets: vi.fn(),
            prepareAliases: vi.fn()
        }));

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await import('../index.js');
        await new Promise(r => setTimeout(r, 50));

        expect(exitSpy).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
    });
});

describe('isMain execution - mismatch path', () => {
    let originalArgv: string[];

    beforeEach(() => {
        originalArgv = [...process.argv];
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.argv = originalArgv;
        vi.restoreAllMocks();
    });

    it('does not execute main if path does not match', async () => {
        vi.resetModules();
        process.argv = ['node', '/some/random/path.js'];

        vi.doMock('../pipeline.js', () => ({
            processAssets: vi.fn(),
            prepareAliases: vi.fn()
        }));

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await import('../index.js');
        await new Promise(r => setTimeout(r, 50));

        expect(exitSpy).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
    });
});
