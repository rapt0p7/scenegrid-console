import { execa } from 'execa';

export function calculatePCMSize(durationSec: number, channels: number, sampleRate: number): number {
    const bytesPerSample = 4;
    const bytesPerSec = sampleRate * channels * bytesPerSample;
    const totalBytes = bytesPerSec * durationSec;
    return totalBytes / (1024 * 1024);
}

export interface AudioMetadata {
    durationSec: number;
    channels: number;
    sampleRate: number;
}

export async function extractMetadata(filePath: string): Promise<AudioMetadata> {
    const { stdout } = await execa('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=channels,sample_rate',
        '-of',
        'json',
        filePath
    ]);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const ffprobeData = JSON.parse(stdout) as {
        format?: { duration?: string };
        // eslint-disable-next-line @typescript-eslint/naming-convention
        streams?: Array<{ channels?: number; sample_rate?: string }>;
    };

    if (!ffprobeData.format?.duration || !ffprobeData.streams?.[0]) {
        throw new Error(`Failed to parse valid metadata from ffprobe output for ${filePath}`);
    }

    const durationSec = parseFloat(ffprobeData.format.duration);
    const channels = ffprobeData.streams[0].channels ?? 0;
    const sampleRate = parseInt(ffprobeData.streams[0].sample_rate ?? '0', 10);

    return {
        durationSec,
        channels,
        sampleRate
    };
}
