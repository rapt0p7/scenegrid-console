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

        expect(config.input).toBe('./cli-input');
        expect(config.output).toBe('./rc-output');
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
});
