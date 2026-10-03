import { describe, it, expect, vi } from 'vitest';

import { createTelemetryWorker } from '../index.js';

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

    it('should post INIT_CONFIG message if remoteSyncUri is provided in config', () => {
        const workerSpy = vi.spyOn(global, 'SharedWorker');
        mockMessagePort.postMessage.mockClear();

        const worker = createTelemetryWorker({}, { remoteSyncUri: 'ws://localhost:8080' });

        expect(mockMessagePort.postMessage).toHaveBeenCalledTimes(1);
        expect(mockMessagePort.postMessage).toHaveBeenCalledWith({
            type: 'INIT_CONFIG',
            remoteSyncUri: 'ws://localhost:8080'
        });

        worker.port.close();
        workerSpy.mockRestore();
    });

    it('should not post INIT_CONFIG message if remoteSyncUri is missing in config', () => {
        const workerSpy = vi.spyOn(global, 'SharedWorker');
        mockMessagePort.postMessage.mockClear();

        const worker = createTelemetryWorker({}, {});

        expect(mockMessagePort.postMessage).not.toHaveBeenCalled();

        worker.port.close();
        workerSpy.mockRestore();
    });
});
