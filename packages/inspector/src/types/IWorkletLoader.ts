export interface IWorkletLoader {
    loadModule(context: BaseAudioContext, rawCode: string): Promise<void>;
}
