import { Command } from 'commander';
import { cosmiconfig } from 'cosmiconfig';
import { z } from 'zod';

export const ConfigSchema = z.object({
    input: z.string().default('./raw-assets'),
    output: z.string().default('./assets'),
    manifests: z.string().default('./configs'),
    baseUrl: z.string().default('/assets'),
    quotaMb: z.number().default(15.0),
    streamRules: z.array(z.string()).default([]),
    streamExclusions: z.array(z.string()).default([]),
    streamPriority: z.enum(['high', 'low']).default('high'),
    hash: z.boolean().default(false),
    aliases: z.string().optional()
});

export type CLIConfig = z.infer<typeof ConfigSchema>;

export async function resolveConfig(readonlyArgv: readonly string[]): Promise<CLIConfig> {
    const explorer = cosmiconfig('scenegrid');
    const result = await explorer.search();
    const rcConfig: Record<string, unknown> = (result?.config as Record<string, unknown>) ?? {};

    const program = new Command();
    program
        .option('--input <path>', 'Input directory for raw audio files')
        .option('--output <path>', 'Output directory for processed assets')
        .option('--manifests <path>', 'Output directory for JSON manifests')
        .option('--baseUrl <url>', 'Base URL prefix used in the generated manifests')
        .option('--quotaMb <number>', 'RAM quota in MB before triggering stream chunking')
        .option('--streamRules <regexes...>', 'Regex patterns to force stream routing')
        .option('--streamExclusions <regexes...>', 'Regex patterns to exclude from stream routing')
        .option('--streamPriority <priority>', 'Priority for streams ("high" or "low")')
        .option('--hash', 'Append MD5 hash to generated file names')
        .option('-a, --aliases <path>', 'Path to JSON file mapping physical basenames to logical SoundIds');

    program.parse([...readonlyArgv]);
    const cliOptions = program.opts() as Record<string, unknown>;

    const merged: Record<string, unknown> = {
        ...rcConfig,
        ...cliOptions
    };

    for (const key of Object.keys(merged)) {
        if (merged[key] === undefined) {
            delete merged[key];
        }
    }

    if (merged.quotaMb !== undefined) {
        merged.quotaMb = Number(merged.quotaMb);
    }

    return ConfigSchema.parse(merged);
}
