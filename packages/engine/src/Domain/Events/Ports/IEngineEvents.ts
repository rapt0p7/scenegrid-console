/* eslint-disable @typescript-eslint/naming-convention */
export interface EngineReadyPayload {
    readonly timestamp: number;
    readonly sampleRate: number;
}

export interface LoadProgressPayload {
    readonly loadedBytes?: number;
    readonly totalBytes?: number;
    readonly loadedItems: number;
    readonly totalItems: number;
    readonly progress: number;
    readonly lastLoadedResource?: string;
}

export interface LoadCompletePayload {
    readonly failedItems: string[];
    readonly durationMs: number;
}

export interface EngineErrorPayload {
    readonly code: 'INIT_FAILED' | 'DECODE_ERROR' | 'NETWORK_ERROR' | 'CONTEXT_LOST';
    readonly message: string;
    readonly details?: unknown;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type AudioEngineEvents = {
    'engine:ready': EngineReadyPayload;
    'engine:error': EngineErrorPayload;
    'load:start': { readonly totalItems: number };
    'load:progress': LoadProgressPayload;
    'load:complete': LoadCompletePayload;
    'state:suspended': void;
    'state:resumed': void;
    'unload:complete': { bankId: string };
};
