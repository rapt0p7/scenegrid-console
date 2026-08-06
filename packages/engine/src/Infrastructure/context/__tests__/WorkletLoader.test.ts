import { AudioContext as MockAudioContext, registrar } from 'standardized-audio-context-mock';
// oxlint-disable max-lines-per-function unicorn/no-useless-undefined
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import WorkletLoader from '../WorkletLoader.js';

describe('WorkletLoader (Fallback & CSP Mechanics)', () => {
    let audioContext: AudioContext;
    let addModuleSpy: ReturnType<typeof vi.fn>;
    const rawWorkletCode = 'class TestProcessor extends AudioWorkletProcessor {}';
    const mockBlobUrl = 'blob:http://localhost/1234-5678-90ab';
    const expectedBase64 = 'Y2xhc3MgVGVzdFByb2Nlc3NvciBleHRlbmRzIEF1ZGlvV29ya2xldFByb2Nlc3NvciB7fQ==';
    const mockDataUri = `data:application/javascript;base64,${expectedBase64}`;

    beforeEach(() => {
        audioContext = new MockAudioContext() as unknown as AudioContext;
        addModuleSpy = vi.fn();

        Object.defineProperty(audioContext, 'audioWorklet', {
            value: { addModule: addModuleSpy },
            configurable: true
        });

        vi.stubGlobal('URL', {
            createObjectURL: vi.fn().mockReturnValue(mockBlobUrl),
            revokeObjectURL: vi.fn()
        });

        vi.stubGlobal('btoa', vi.fn().mockReturnValue(expectedBase64));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        registrar.reset(audioContext as any);
    });

    it('should successfully load a worklet using URL.createObjectURL(blob) as the primary method', async () => {
        addModuleSpy.mockResolvedValueOnce(undefined);

        await WorkletLoader.loadModule(audioContext, rawWorkletCode);

        expect(URL.createObjectURL).toHaveBeenCalledOnce();

        expect(addModuleSpy).toHaveBeenCalledTimes(1);
        expect(addModuleSpy).toHaveBeenCalledWith(mockBlobUrl);

        expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockBlobUrl);
    });

    it('should catch CSP blob: errors and gracefully fallback to a Base64 data: URI', async () => {
        addModuleSpy.mockRejectedValueOnce(new Error("Failed to execute 'addModule': The user aborted a request."));
        addModuleSpy.mockResolvedValueOnce(undefined);

        await WorkletLoader.loadModule(audioContext, rawWorkletCode);

        expect(addModuleSpy).toHaveBeenCalledTimes(2);

        expect(addModuleSpy).toHaveBeenNthCalledWith(1, mockBlobUrl);

        expect(btoa).toHaveBeenCalledWith(rawWorkletCode);
        expect(addModuleSpy).toHaveBeenNthCalledWith(2, mockDataUri);

        expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockBlobUrl);
    });

    it('should throw a detailed error if both blob: and data: fallback methods fail', async () => {
        addModuleSpy.mockRejectedValue(new Error('CSP Violation: All scripts blocked'));

        await expect(WorkletLoader.loadModule(audioContext, rawWorkletCode)).rejects.toThrow(
            /Failed to load AudioWorkletProcessor.*CSP/
        );

        expect(addModuleSpy).toHaveBeenCalledTimes(2);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockBlobUrl);
    });
});
