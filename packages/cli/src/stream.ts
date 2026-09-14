// oxlint-disable max-lines-per-function
/* eslint-disable @typescript-eslint/naming-convention */
import { execa } from 'execa';
import fs from 'node:fs';
import path from 'node:path';

export interface IStreamChunk {
    readonly url: string;
    readonly trimStartSamples: number;
    readonly durationSamples: number;
}

export interface IStreamManifestLocal {
    readonly isLooping: boolean;
    readonly chunks: readonly IStreamChunk[];
}

export async function generateChunkedStream(
    inputPath: string,
    outputDir: string,
    baseUrl: string,
    durationSec: number,
    sampleRate: number = 44100,
    hashSuffix: string = ''
): Promise<IStreamManifestLocal> {
    const CHUNK_SECONDS = 5;
    const TRIM_SECONDS = 0.25;
    const TOTAL_CHUNKS = Math.floor(durationSec / CHUNK_SECONDS) + 1;

    const basename = path.basename(inputPath, path.extname(inputPath));
    const chunks: IStreamChunk[] = [];

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const encodePromises = [];

    for (let i = 0; i < TOTAL_CHUNKS; i++) {
        const idx = i.toString().padStart(3, '0');
        const chunkFilename = `${basename}_${idx}${hashSuffix}.ogg`;
        const chunkPath = path.join(outputDir, chunkFilename);

        const logicalStart = i * CHUNK_SECONDS;
        const remaining = durationSec - logicalStart;
        const logicalDur = Math.min(remaining, CHUNK_SECONDS);

        let physicalStart = 0;
        let trimSamples = 0;
        let dur = 0;

        if (i === 0) {
            physicalStart = 0;
            trimSamples = 0;
            dur = logicalDur + TRIM_SECONDS;
        } else {
            physicalStart = logicalStart - TRIM_SECONDS;
            trimSamples = Math.round(TRIM_SECONDS * sampleRate);
            dur = logicalDur + 2 * TRIM_SECONDS;
        }

        encodePromises.push(
            execa('ffmpeg', [
                '-v',
                'error',
                '-y',
                '-ss',
                physicalStart.toFixed(3),
                '-t',
                dur.toFixed(3),
                '-i',
                inputPath,
                '-vn',
                '-c:a',
                'libvorbis',
                '-q:a',
                '4',
                '-ar',
                sampleRate.toString(),
                chunkPath
            ])
        );

        const durationSamples = Math.round(logicalDur * sampleRate);

        chunks.push({
            url: `${baseUrl}/${chunkFilename}`,
            durationSamples,
            trimStartSamples: trimSamples
        });
    }

    await Promise.all(encodePromises);

    return {
        isLooping: true,
        chunks
    };
}
