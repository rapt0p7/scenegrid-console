import { vi } from 'vitest';

globalThis.AudioWorkletProcessor = class AudioWorkletProcessor {
    public port = {
        postMessage: vi.fn(),
        onmessage: null
    };
} as any;

globalThis.registerProcessor = vi.fn();
