// oxlint-disable max-lines-per-function
// oxlint-disable-next-line typescript/no-extraneous-class
export default class WorkletLoader {
    /**
     * Attempts to load an AudioWorkletProcessor from a raw JavaScript string.
     * Uses a progressive fallback strategy to bypass strict CSP rules (e.g., in iframes).
     * * Strategy:
     * 1. Try `blob:` URL (Preferred, lowest memory footprint).
     * 2. Fallback to `data:` URI (Base64) if `blob:` is blocked by CSP.
     * * @param context - The target BaseAudioContext (AudioContext or OfflineAudioContext).
     * @param rawCode - The raw, transpiled JavaScript string of the worklet.
     */
    public static async loadModule(context: BaseAudioContext, rawCode: string): Promise<void> {
        if (!context.audioWorklet) {
            throw new Error('AudioWorklet is not supported in this environment.');
        }

        const blob = new Blob([rawCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);

        try {
            await context.audioWorklet.addModule(blobUrl);
        } catch (blobError) {
            try {
                const base64Code = btoa(rawCode);
                const dataUri = `data:application/javascript;base64,${base64Code}`;

                await context.audioWorklet.addModule(dataUri);
            } catch (dataError) {
                throw new Error(
                    // oxlint-disable-next-line typescript/restrict-template-expressions
                    `Failed to load AudioWorkletProcessor. CSP blocked both blob: and data: URIs.\nBlob Error: ${blobError}\nData URI Error: ${dataError}`,
                    { cause: dataError }
                );
            }
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    }
}
