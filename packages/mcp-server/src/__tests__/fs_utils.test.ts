import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
    writeFile: vi.fn().mockResolvedValue(),
    readFile: vi.fn().mockResolvedValue('{"key":"value"}')
}));

import * as fsPromises from 'node:fs/promises';

import { writeJsonFile, readJsonFile } from '../fs_utils.js';

describe('fs_utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('writeJsonFile', () => {
        it('serialises data as indented JSON and writes to the given path', async () => {
            const data = { hello: 'world', count: 42 };
            await writeJsonFile('/tmp/out.json', data);

            expect(fsPromises.writeFile).toHaveBeenCalledWith('/tmp/out.json', JSON.stringify(data, null, 4), 'utf-8');
        });

        it('propagates errors from the underlying writeFile call', async () => {
            (fsPromises.writeFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ENOENT'));

            await expect(writeJsonFile('/bad/path.json', {})).rejects.toThrow('ENOENT');
        });
    });

    describe('readJsonFile', () => {
        it('reads a file and parses it as JSON', async () => {
            (fsPromises.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce('{"name":"test","value":1}');

            const result = await readJsonFile('/tmp/in.json');

            expect(fsPromises.readFile).toHaveBeenCalledWith('/tmp/in.json', 'utf-8');
            expect(result).toEqual({ name: 'test', value: 1 });
        });

        it('propagates errors from the underlying readFile call', async () => {
            (fsPromises.readFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ENOENT'));

            await expect(readJsonFile('/missing.json')).rejects.toThrow('ENOENT');
        });
    });
});
