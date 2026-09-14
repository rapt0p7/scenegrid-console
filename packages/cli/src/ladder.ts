import { execa } from 'execa';
import fs from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';

export interface CodecLadderOutput {
    readonly url: Record<string, string>;
}

export async function generateCodecLadder(
    inputPath: string,
    outputDir: string,
    baseUrl: string,
    concurrency: number = 2,
    hashSuffix: string = ''
): Promise<CodecLadderOutput> {
    const limit = pLimit(concurrency);
    const basename = path.basename(inputPath, path.extname(inputPath));
    const formats = [
        { ext: 'webm', codec: 'libopus', args: ['-b:a', '96k'] },
        { ext: 'mp3', codec: 'libmp3lame', args: ['-q:a', '2'] },
        { ext: 'm4a', codec: 'aac', args: ['-b:a', '128k'] }
    ];

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const tasks = formats.map(fmt =>
        limit(async () => {
            const outputFilename = `${basename}${hashSuffix}.${fmt.ext}`;
            const outputPath = path.join(outputDir, outputFilename);

            await execa('ffmpeg', [
                '-v',
                'error',
                '-y',
                '-i',
                inputPath,
                '-vn',
                '-c:a',
                fmt.codec,
                ...fmt.args,
                outputPath
            ]);

            return { [fmt.ext]: `${baseUrl}/${outputFilename}` };
        })
    );

    const results = await Promise.all(tasks);
    const urls = results.reduce((acc, curr) => ({ ...acc, ...curr }), {});

    return { url: urls };
}
