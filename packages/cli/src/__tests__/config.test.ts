import { cosmiconfig } from 'cosmiconfig';
import { describe, it, expect, vi } from 'vitest';

import { resolveConfig } from '../config.js';

vi.mock('cosmiconfig');

describe('CLI Configuration Merging', () => {
    it('merges rc config and cli flags, prioritizing cli flags', async () => {
        const mockCosmiconfig = {
            search: vi.fn().mockResolvedValue({
                config: {
                    input: './rc-input',
                    output: './rc-output'
                }
            })
        };
        (cosmiconfig as any).mockReturnValue(mockCosmiconfig);

        const argv = ['node', 'cli.js', '--input', './cli-input'];
        const config = await resolveConfig(argv);

        expect(cosmiconfig).toHaveBeenCalledWith('scenegrid');
        expect(config.input).toBe('./cli-input');
        expect(config.output).toBe('./rc-output');
    });

    it('sets up the expected CLI help descriptions', async () => {
        const mockCosmiconfig = {
            search: vi.fn().mockResolvedValue(null)
        };
        (cosmiconfig as any).mockReturnValue(mockCosmiconfig);

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit called');
        });
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        await expect(resolveConfig(['node', 'cli.js', '--help'])).rejects.toThrow('process.exit called');

        const helpOutput = stdoutSpy.mock.calls
            .map(call => call[0])
            .join('')
            .replaceAll(/\s+/g, ' ');

        expect(helpOutput).toContain('Input directory for raw audio files');
        expect(helpOutput).toContain('Output directory for processed assets');
        expect(helpOutput).toContain('Output directory for JSON manifests');
        expect(helpOutput).toContain('Base URL prefix used in the generated manifests');
        expect(helpOutput).toContain('RAM quota in MB before triggering stream chunking');
        expect(helpOutput).toContain('Regex patterns to force stream routing');
        expect(helpOutput).toContain('Regex patterns to exclude from stream routing');
        expect(helpOutput).toContain('Priority for streams ("high" or "low")');
        expect(helpOutput).toContain('Append MD5 hash to generated file names');
        expect(helpOutput).toContain('Path to JSON file mapping physical basenames to logical SoundIds');

        exitSpy.mockRestore();
        stdoutSpy.mockRestore();
    });

    it('throws expected errors on invalid inputs (zod validation)', async () => {
        const mockCosmiconfig = {
            search: vi.fn().mockResolvedValue({
                config: {
                    quotaMb: 'not-a-number'
                }
            })
        };
        (cosmiconfig as any).mockReturnValue(mockCosmiconfig);

        const argv = ['node', 'cli.js'];
        await expect(resolveConfig(argv)).rejects.toThrow();
    });

    it('applies schema defaults when no rc config and no CLI flags', async () => {
        const mockCosmiconfig = {
            search: vi.fn().mockResolvedValue(null)
        };
        (cosmiconfig as any).mockReturnValue(mockCosmiconfig);

        const config = await resolveConfig(['node', 'cli.js']);

        expect(config.input).toBe('./raw-assets');
        expect(config.output).toBe('./assets');
        expect(config.manifests).toBe('./configs');
        expect(config.baseUrl).toBe('/assets');
        expect(config.quotaMb).toBe(15.0);
        expect(config.hash).toBe(false);
        expect(config.streamRules).toEqual([]);
        expect(config.streamExclusions).toEqual([]);
        expect(config.streamPriority).toBe('high');
        expect(config.aliases).toBeUndefined();
    });

    it('removes undefined CLI options before merging (does not override rc values)', async () => {
        const mockCosmiconfig = {
            search: vi.fn().mockResolvedValue({
                config: {
                    input: './from-rc',
                    quotaMb: 25
                }
            })
        };
        (cosmiconfig as any).mockReturnValue(mockCosmiconfig);

        const config = await resolveConfig(['node', 'cli.js', '--output', './from-cli']);

        expect(config.input).toBe('./from-rc');
        expect(config.output).toBe('./from-cli');
        expect(config.quotaMb).toBe(25);
    });

    it('parses --quotaMb from CLI as a number', async () => {
        const mockCosmiconfig = {
            search: vi.fn().mockResolvedValue(null)
        };
        (cosmiconfig as any).mockReturnValue(mockCosmiconfig);

        const config = await resolveConfig(['node', 'cli.js', '--quotaMb', '42']);

        expect(config.quotaMb).toBe(42);
        expect(typeof config.quotaMb).toBe('number');
    });
});
