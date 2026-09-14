// noinspection D

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { generateCodecLadder } from './ladder.js';
import { extractMetadata, calculatePCMSize } from './pcm.js';
import { routeAsset } from './router.js';
import { generateChunkedStream } from './stream.js';

export interface ProcessOptions {
    inputDir: string;
    outputDir: string;
    manifestsDir: string;
    baseUrl: string;
    quotaMb: number;
    streamRules: string[];
    streamExclusions: string[];
    streamPriority: 'high' | 'low';
    hash: boolean;
    aliases?: string;
}

async function getFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => {
            resolve(hash.digest('hex').slice(0, 6));
        });
        stream.on('error', err => {
            reject(err);
        });
    });
}

// oxlint-disable-next-line max-lines-per-function
export async function processAssets(options: ProcessOptions) {
    const {
        inputDir,
        outputDir,
        manifestsDir,
        baseUrl,
        quotaMb,
        streamRules,
        streamExclusions,
        streamPriority,
        hash,
        aliases
    } = options;

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(manifestsDir)) {
        fs.mkdirSync(manifestsDir, { recursive: true });
    }

    const audioExtensions = new Set(['.wav', '.mp3', '.ogg', '.flac', '.aiff', '.m4a']);
    const files = fs.readdirSync(inputDir).filter(f => audioExtensions.has(path.extname(f).toLowerCase()));

    let invertedAliases: Record<string, string[]> = {};
    if (aliases) {
        console.log(`Loading aliases from: ${path.resolve(aliases)}`);
        if (fs.existsSync(aliases)) {
            const rawMap = JSON.parse(fs.readFileSync(aliases, 'utf-8'));
            for (const [logicalId, physicalName] of Object.entries(rawMap)) {
                const basename = physicalName as string;
                if (!invertedAliases[basename]) {
                    invertedAliases[basename] = [];
                }
                invertedAliases[basename].push(logicalId);
            }
            console.log(`Loaded aliases: ${Object.keys(invertedAliases).length} physical files mapped`);
        } else {
            console.log(`Aliases file not found: ${aliases}`);
        }
    }

    const precalculatedSizes: Record<string, number> = {};
    const soundMap: Record<string, any> = {};

    const processPromises = files.map(async file => {
        const inputPath = path.join(inputDir, file);
        const basename = path.basename(file, path.extname(file));

        const metadata = await extractMetadata(inputPath);
        const sizeMb = calculatePCMSize(metadata.durationSec, metadata.channels, metadata.sampleRate);
        const route = routeAsset(sizeMb, quotaMb, basename, streamRules, streamExclusions);
        const hashSuffix = hash ? `.${await getFileHash(inputPath)}` : '';

        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        // oxlint-disable-next-line no-shadow
        const aliases = invertedAliases[basename] ? invertedAliases[basename] : [basename];

        if (route === 'chunk') {
            const streamOut = await generateChunkedStream(
                inputPath,
                outputDir,
                baseUrl,
                metadata.durationSec,
                metadata.sampleRate,
                hashSuffix
            );

            const streamManifestPath = path.join(outputDir, `${basename}${hashSuffix}.json`);
            fs.writeFileSync(streamManifestPath, JSON.stringify(streamOut, null, 2));

            for (const alias of aliases) {
                soundMap[alias] = {
                    url: `${cleanBaseUrl}/${basename}${hashSuffix}.json`,
                    priority: streamPriority
                };
            }
        } else {
            const ladderOut = await generateCodecLadder(inputPath, outputDir, baseUrl, 2, hashSuffix);

            for (const alias of aliases) {
                soundMap[alias] = {
                    url: Object.values(ladderOut.url)
                };
            }

            precalculatedSizes[basename] = sizeMb;
        }
    });

    await Promise.all(processPromises);

    const audioSizesPath = path.join(manifestsDir, 'audio-sizes.json');
    const soundMapPath = path.join(manifestsDir, 'sound-manifest.json');

    fs.writeFileSync(audioSizesPath, JSON.stringify(precalculatedSizes, null, 2));
    fs.writeFileSync(soundMapPath, JSON.stringify(soundMap, null, 2));

    const payload: any = {
        precalculatedSizes: {},
        ramQuotaMb: quotaMb,
        manifest: {},
        buses: { master: { volume: 1, routing: [] } },
        banks: { main: { isPreloaded: true, type: 'Memory', sounds: [] } },
        soundMap: {}
    };

    for (const [key, value] of Object.entries(soundMap)) {
        payload.manifest[key] = {
            url: value.url,
            priority: value.priority || 'high'
        };
        payload.soundMap[key] = {
            busId: 'master',
            bankId: 'main',
            manifestId: key
        };
        payload.banks.main.sounds.push(key);

        const primaryUrl = Array.isArray(value.url) ? value.url[0] : value.url;
        const basenameMatch = primaryUrl.match(/\/([^/]+?)(?:\.[a-f0-9]{6})?\.(?:json|mp3|webm|m4a|ogg)$/);
        if (basenameMatch && precalculatedSizes[basenameMatch[1]]) {
            payload.precalculatedSizes[primaryUrl] = precalculatedSizes[basenameMatch[1]];
        }
    }

    const engineName = '@scene-grid/engine';
    const { ConsistencyChecker } = await import(engineName);
    const result = ConsistencyChecker.validate(payload, { isReturnWithReport: true });

    if (Array.isArray(result) && !result[0]) {
        console.warn(
            '\nPipeline finished, but Consistency Check reported errors. Please review the engine logs above.'
        );
    } else {
        console.log('\nConsistency Check Passed!');
    }
}

export async function prepareAliases(inputDir: string, outputPath: string) {
    if (!fs.existsSync(inputDir)) {
        console.error(`Input directory not found: ${inputDir}`);
        return;
    }

    const audioExtensions = new Set(['.wav', '.mp3', '.ogg', '.flac', '.aiff', '.m4a']);
    const files = fs.readdirSync(inputDir).filter(f => audioExtensions.has(path.extname(f).toLowerCase()));

    const aliases: Record<string, string> = {};
    for (let i = 0; i < files.length; i++) {
        const basename = path.basename(files[i], path.extname(files[i]));
        aliases[`placeholder${i + 1}`] = basename;
    }

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(aliases, null, 2));
    console.log(`Prepared aliases template at: ${outputPath}`);
    console.log(`Generated ${files.length} placeholders.`);
}
