// oxlint-disable typescript/no-redundant-type-constituents

export interface IAudioCtxProxy {
    readonly sampleRate: number;
    createAnalyser(): AnalyserNode;
}

export interface IGainNodeProxy {
    readonly context: IAudioCtxProxy | any;
    connect(destinationNode: any, output?: number, input?: number): any;
}

export interface IAudioWorkletNodeProxy {
    readonly context: IAudioCtxProxy | any;
    readonly port: MessagePort | any;
    connect(destinationNode: any, output?: number, input?: number): any;
}

export interface ISoundInstanceProxy {
    id: string;
    state: string;
}

export interface IAudioBusProxy {
    name?: string;
    analyzerTapNode?: IGainNodeProxy | any;
    targetParams?: {
        gain?: {
            logical: number;
            rtpc: number;
        };
    };
    logicalTargetGain?: number;
}

export interface IAudioBusSystemProxy {
    getAllBuses(): Map<string, IAudioBusProxy>;
}
