/* eslint-disable @typescript-eslint/naming-convention */
export interface EngineReadyPayload {
    timestamp: number;
    sampleRate: number;
}

export interface LoadProgressPayload {
    loadedBytes?: number;
    totalBytes?: number;
    loadedItems: number;
    totalItems: number;
    progress: number;
    lastLoadedResource?: string;
}

export interface LoadCompletePayload {
    failedItems: string[];
    durationMs: number;
}

export interface EngineErrorPayload {
    code: 'INIT_FAILED' | 'DECODE_ERROR' | 'NETWORK_ERROR' | 'CONTEXT_LOST';
    message: string;
    details?: unknown;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type AudioEngineEvents = {
    'engine:ready': EngineReadyPayload;
    'engine:error': EngineErrorPayload;
    'load:start': { totalItems: number };
    'load:progress': LoadProgressPayload;
    'load:complete': LoadCompletePayload;
    'state:suspended': void;
    'state:resumed': void;
};
