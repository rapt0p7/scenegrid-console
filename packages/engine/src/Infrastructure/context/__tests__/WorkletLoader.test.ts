import { AudioContext as MockAudioContext, registrar } from 'standardized-audio-context-mock';
// oxlint-disable max-lines-per-function unicorn/no-useless-undefined
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import WorkletLoader from '../WorkletLoader.js';

describe('WorkletLoader (Fallback & CSP Mechanics)', () => {
    let audioContext: AudioContext;
    let addModuleSpy: ReturnType<typeof vi.fn>;
    let rawWorkletCode = 'class TestProcessor extends AudioWorkletProcessor {}';
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

        const [createdBlob] = vi.mocked(URL.createObjectURL).mock.calls[0] as [Blob];
        expect(createdBlob).toBeInstanceOf(Blob);
        expect(createdBlob.type).toBe('application/javascript');
        await expect(createdBlob.text()).resolves.toBe(rawWorkletCode);

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

    it('should throw a detailed error chaining the root cause if both blob: and data: fallback methods fail', async () => {
        const blobError = new Error('CSP Violation: blob: blocked');
        const dataError = new Error('CSP Violation: data: blocked');
        addModuleSpy.mockRejectedValueOnce(blobError);
        addModuleSpy.mockRejectedValueOnce(dataError);

        let caughtError: Error | undefined;
        try {
            await WorkletLoader.loadModule(audioContext, rawWorkletCode);
        } catch (error) {
            caughtError = error as Error;
        }

        expect(caughtError).toBeInstanceOf(Error);
        expect(caughtError?.message).toBe(
            `Failed to load AudioWorkletProcessor. CSP blocked both blob: and data: URIs.\nBlob Error: ${blobError}\nData URI Error: ${dataError}`
        );
        expect(caughtError?.cause).toBe(dataError);
        expect(addModuleSpy).toHaveBeenCalledTimes(2);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockBlobUrl);
    });

    it('should throw an informative error when AudioWorklet is not supported in the context', async () => {
        const unsupportedContext = {} as BaseAudioContext;
        rawWorkletCode = 'class TestProcessor extends AudioWorkletProcessor {}';

        await expect(WorkletLoader.loadModule(unsupportedContext, rawWorkletCode)).rejects.toThrowError(
            new Error('AudioWorklet is not supported in this environment.')
        );
    });
});
