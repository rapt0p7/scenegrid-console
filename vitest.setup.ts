import { vi } from 'vitest';

(globalThis as unknown as Record<string, unknown>).AudioWorkletProcessor = class AudioWorkletProcessor {
    public port = {
        postMessage: vi.fn(),
        onmessage: null
    };
};

(globalThis as unknown as Record<string, unknown>).registerProcessor = vi.fn();
