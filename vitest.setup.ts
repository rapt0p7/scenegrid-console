import { vi } from 'vitest';

(globalThis as Record<string, unknown>).AudioWorkletProcessor = class AudioWorkletProcessor {
    public port = {
        postMessage: vi.fn(),
        onmessage: null
    };
} as any;

(globalThis as Record<string, unknown>).registerProcessor = vi.fn();
