// oxlint-disable unicorn/no-array-sort
// noinspection D

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { generateCodecLadder } from './ladder.js';
import { extractMetadata, calculatePCMSize } from './pcm.js';
import { routeAsset } from './router.js';
import { generateChunkedStream } from './stream.js';

export type ManifestPriority = 'high' | 'low';

export type AliasEntry =
    | string
    | {
          readonly file: string;
          readonly priority?: ManifestPriority;
      };

export type AliasMap = Record<string, AliasEntry>;

interface ResolvedAlias {
    readonly logicalId: string;
    readonly priority?: ManifestPriority;
}

const VALID_PRIORITIES = new Set<string>(['high', 'low']);
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.flac', '.aiff', '.m4a']);
const AUDIO_BASENAME_PATTERN = /\/([^/]+?)(?:\.[a-f0-9]{6})?\.(?:json|mp3|webm|m4a|ogg)$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseManifestPriority(logicalId: string, value: unknown): ManifestPriority | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'string' && VALID_PRIORITIES.has(value)) {
        return value as ManifestPriority;
    }
    throw new Error(`Invalid alias priority for "${logicalId}": expected "high" or "low".`);
}

function parseStructuredAliasEntry(
    logicalId: string,
    obj: Record<string, unknown>
): { file: string; alias: ResolvedAlias } {
    if (typeof obj.file !== 'string' || !obj.file.trim()) {
        throw new Error(`Invalid alias entry for "${logicalId}": expected non-empty string "file".`);
    }
    const priority = parseManifestPriority(logicalId, obj.priority);
    return {
        file: obj.file,
        alias: {
            logicalId,
            ...(priority === undefined ? {} : { priority })
        }
    };
}

export function parseAliasEntry(logicalId: string, entry: unknown): { file: string; alias: ResolvedAlias } {
    if (typeof entry === 'string') {
        if (!entry.trim()) {
            throw new Error(`Invalid alias entry for "${logicalId}": physical filename must be a non-empty string.`);
        }
        return { file: entry, alias: { logicalId } };
    }

    if (isPlainObject(entry)) {
        return parseStructuredAliasEntry(logicalId, entry);
    }

    throw new Error(`Invalid alias entry for "${logicalId}": expected string or { file, priority? }.`);
}

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

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function loadInvertedAliases(aliases?: string): Record<string, ResolvedAlias[]> {
    const invertedAliases: Record<string, ResolvedAlias[]> = {};
    if (!aliases) return invertedAliases;

    console.log(`Loading aliases from: ${path.resolve(aliases)}`);
    if (!fs.existsSync(aliases)) {
        console.log(`Aliases file not found: ${aliases}`);
        return invertedAliases;
    }

    const rawMap = JSON.parse(fs.readFileSync(aliases, 'utf-8')) as Record<string, unknown>;
    for (const [logicalId, rawEntry] of Object.entries(rawMap)) {
        const { file: basename, alias } = parseAliasEntry(logicalId, rawEntry);
        invertedAliases[basename] ??= [];
        invertedAliases[basename].push(alias);
    }
    console.log(`Loaded aliases: ${Object.keys(invertedAliases).length} physical files mapped`);
    return invertedAliases;
}

function sortObject<T>(obj: Record<string, T>): Record<string, T> {
    const sorted: Record<string, T> = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = obj[key];
    }
    return sorted;
}

async function processSingleAsset(
    file: string,
    options: ProcessOptions,
    invertedAliases: Record<string, ResolvedAlias[]>,
    precalculatedSizes: Record<string, number>,
    soundMap: Record<string, any>
): Promise<void> {
    const { inputDir, outputDir, baseUrl, quotaMb, streamRules, streamExclusions, streamPriority, hash } = options;
    const inputPath = path.join(inputDir, file);
    const basename = path.basename(file, path.extname(file));

    const metadata = await extractMetadata(inputPath);
    const sizeMb = calculatePCMSize(metadata.durationSec, metadata.channels, metadata.sampleRate);
    const route = routeAsset(sizeMb, quotaMb, basename, streamRules, streamExclusions);
    const hashSuffix = hash ? `.${await getFileHash(inputPath)}` : '';
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const resolvedAliases: readonly ResolvedAlias[] = invertedAliases[basename] ?? [{ logicalId: basename }];

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
        fs.writeFileSync(streamManifestPath, JSON.stringify(streamOut, null, 4) + '\n');

        for (const alias of resolvedAliases) {
            soundMap[alias.logicalId] = {
                url: `${cleanBaseUrl}/${basename}${hashSuffix}.json`,
                priority: alias.priority ?? streamPriority,
                isStream: true
            };
        }
        return;
    }

    const ladderOut = await generateCodecLadder(inputPath, outputDir, baseUrl, 2, hashSuffix);
    for (const alias of resolvedAliases) {
        soundMap[alias.logicalId] = {
            url: Object.values(ladderOut.url),
            ...(alias.priority === undefined ? {} : { priority: alias.priority })
        };
    }
    precalculatedSizes[basename] = sizeMb;
}

function buildValidationPayload(
    sortedSoundMap: Record<string, any>,
    precalculatedSizes: Record<string, number>,
    quotaMb: number
): any {
    const payload: any = {
        precalculatedSizes: {},
        ramQuotaMb: quotaMb,
        manifest: {},
        buses: { master: { gain: 1 } },
        banks: { main: { id: 'main', sounds: [] } },
        soundMap: {}
    };

    for (const [key, value] of Object.entries(sortedSoundMap)) {
        payload.manifest[key] = {
            url: value.url,
            priority: value.priority ?? 'low',
            ...(value.isStream ? { isStream: true } : {})
        };
        payload.soundMap[key] = { busId: 'master' };
        payload.banks.main.sounds.push(key);

        const primaryUrl = Array.isArray(value.url) ? value.url[0] : value.url;
        const fileName = primaryUrl.split('/').pop()?.split('.')[0];
        const basenameMatch = primaryUrl.match(AUDIO_BASENAME_PATTERN);
        if (fileName && basenameMatch && precalculatedSizes[basenameMatch[1]] !== undefined) {
            payload.precalculatedSizes[fileName] = precalculatedSizes[basenameMatch[1]];
        }
    }

    return payload;
}

async function runConsistencySelfCheck(payload: any): Promise<void> {
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

export async function processAssets(options: ProcessOptions) {
    ensureDir(options.outputDir);
    ensureDir(options.manifestsDir);

    const files = fs.readdirSync(options.inputDir).filter(f => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()));
    const invertedAliases = loadInvertedAliases(options.aliases);

    const precalculatedSizes: Record<string, number> = {};
    const soundMap: Record<string, any> = {};

    await Promise.all(
        files.map(file => processSingleAsset(file, options, invertedAliases, precalculatedSizes, soundMap))
    );

    const sortedSizes = sortObject(precalculatedSizes);
    const sortedSoundMap = sortObject(soundMap);

    fs.writeFileSync(path.join(options.manifestsDir, 'audio-sizes.json'), JSON.stringify(sortedSizes, null, 4) + '\n');
    fs.writeFileSync(
        path.join(options.manifestsDir, 'sound-manifest.json'),
        JSON.stringify(sortedSoundMap, null, 4) + '\n'
    );

    const payload = buildValidationPayload(sortedSoundMap, precalculatedSizes, options.quotaMb);
    await runConsistencySelfCheck(payload);
}

export async function prepareAliases(inputDir: string, outputPath: string) {
    if (!fs.existsSync(inputDir)) {
        console.error(`Input directory not found: ${inputDir}`);
        return;
    }

    const audioExtensions = new Set(['.wav', '.mp3', '.ogg', '.flac', '.aiff', '.m4a']);
    const files = fs
        .readdirSync(inputDir)
        .filter(f => audioExtensions.has(path.extname(f).toLowerCase()))
        .sort();

    const aliases: Record<string, string> = {};
    for (let i = 0; i < files.length; i++) {
        const basename = path.basename(files[i], path.extname(files[i]));
        aliases[`placeholder${i + 1}`] = basename;
    }

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(aliases, null, 4) + '\n');
    console.log(`Prepared aliases template at: ${outputPath}`);
    console.log(`Generated ${files.length} placeholders.`);
}
