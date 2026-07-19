import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type AudioContextManager from '@infrastructure/context/AudioContextManager.js';
import type { GainNodeLike } from '@infrastructure/types/IAudioContext.js';
import type { Milliseconds } from '@scene-grid/shared';

export default class MasterOutput {
    public readonly silentTail: GainNodeLike;
    public readonly input: GainNodeLike;
    private readonly masterGain: GainNodeLike;

    constructor(
        contextManager: AudioContextManager,
        private readonly automation: AutomationEngine
    ) {
        const context = contextManager.context;

        this.input = context.createGain();
        this.masterGain = context.createGain();
        this.silentTail = context.createGain();

        this.silentTail.gain.value = 0;

        this.input.connect(this.masterGain);
        this.masterGain.connect(context.destination);
        this.silentTail.connect(context.destination);
    }

    setVolume(value: number, fadeTime = 0 as Milliseconds): void {
        if (fadeTime <= 0) {
            this.masterGain.gain.value = value;
            return;
        }

        this.automation.ramp(this.masterGain.gain, value, fadeTime, 'linear');
    }

    mute(): void {
        this.setVolume(0, 50 as Milliseconds);
    }

    unmute(value = 1): void {
        this.setVolume(value, 50 as Milliseconds);
    }

    dispose(): void {
        this.input.disconnect();
        this.masterGain.disconnect();
        this.silentTail.disconnect();
    }
}
