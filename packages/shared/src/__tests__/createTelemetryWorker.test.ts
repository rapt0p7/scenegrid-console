import { describe, it, expect, vi } from 'vitest';

import { createTelemetryWorker } from '../index.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const mockMessagePort = {
    start: vi.fn(),
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn()
};

vi.stubGlobal(
    'SharedWorker',
    class SharedWorkerMock {
        public port = mockMessagePort;
        // oxlint-disable-next-line no-useless-constructor
        constructor() {}
    }
);

describe('createTelemetryWorker path resolution', () => {
    it('should resolve the worker script path correctly with valid options', () => {
        const workerSpy = vi.spyOn(global, 'SharedWorker');
        const options = { name: 'test-worker' };

        const worker = createTelemetryWorker(options);

        const [workerPath, workerOptions] = workerSpy.mock.calls[0];

        expect(String(workerPath)).toContain('TelemetryWorker.ts');

        expect(workerOptions).toEqual(
            expect.objectContaining({
                name: 'test-worker',
                type: 'module'
            })
        );

        worker.port.close();
        workerSpy.mockRestore();
    });

    it('should handle empty options object as a boundary', () => {
        const workerSpy = vi.spyOn(global, 'SharedWorker');

        const worker = createTelemetryWorker({});

        const [workerPath, workerOptions] = workerSpy.mock.calls[0];

        expect(String(workerPath)).toContain('TelemetryWorker.ts');

        expect(workerOptions).toEqual(
            expect.objectContaining({
                type: 'module'
            })
        );

        worker.port.close();
        workerSpy.mockRestore();
    });
});
