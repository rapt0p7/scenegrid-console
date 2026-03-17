export interface IAudioEngineConfig {
    manifest: Record<string, any>;
    buses: any;
    snapshots: any;
    soundMap: any;
    globalVoiceLimit?: number;
}
