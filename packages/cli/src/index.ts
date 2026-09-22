#!/usr/bin/env node
import path from 'node:path';

import { resolveConfig } from './config.js';
import { processAssets, prepareAliases } from './pipeline.js';

export { processAssets, prepareAliases } from './pipeline.js';
export { extractMetadata, calculatePCMSize } from './pcm.js';
export { routeAsset } from './router.js';

async function main() {
    try {
        if (process.argv.includes('init-aliases')) {
            const inputIdx = process.argv.indexOf('--input');
            const outputIdx = process.argv.indexOf('--output');

            const inputDir = inputIdx > -1 ? path.resolve(process.argv[inputIdx + 1]) : path.resolve('./raw-assets');
            const outputPath =
                outputIdx > -1 ? path.resolve(process.argv[outputIdx + 1]) : path.resolve('./aliases.json');

            await prepareAliases(inputDir, outputPath);
            return;
        }

        const config = await resolveConfig(process.argv);
        const inputDir = path.resolve(config.input);
        const outputDir = path.resolve(config.output);
        const manifestsDir = path.resolve(config.manifests);

        console.log(`Starting SceneGrid CLI Asset Pipeline`);
        console.log(`Input: ${inputDir}`);
        console.log(`Audio Output: ${outputDir}`);
        console.log(`Manifests Output: ${manifestsDir}`);
        console.log(`Base URL: ${config.baseUrl}`);
        console.log(`RAM Quota: ${config.quotaMb} MB`);

        await processAssets({
            inputDir,
            outputDir,
            manifestsDir,
            baseUrl: config.baseUrl,
            quotaMb: config.quotaMb,
            streamRules: config.streamRules,
            streamExclusions: config.streamExclusions,
            streamPriority: config.streamPriority,
            hash: config.hash,
            aliases: config.aliases
        });
        console.log('Pipeline finished successfully!');
    } catch (error) {
        console.error('CLI execution failed:', error);
        process.exit(1);
    }
}

import fs from 'node:fs';

const isMain = () => {
    if (!process.argv[1]) return false;
    try {
        return fs.realpathSync(process.argv[1]) === import.meta.filename;
    } catch {
        return false;
    }
};

if (isMain()) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
