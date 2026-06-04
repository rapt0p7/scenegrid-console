import AudioDebugger, { DebuggerOptions } from './AudioDebugger.js';
import { initAudioDebugPanel } from './AudioDebugPanel.js';

export { AudioDebugger, initAudioDebugPanel };

export async function attachDebugUI(audioEngine: any, options?: DebuggerOptions): Promise<void> {
    if (!audioEngine || !audioEngine._debug) {
        console.warn('[Debug] Cannot attach UI: Invalid AudioEngine instance.');
        return;
    }

    const { contextManager, busSystem } = audioEngine._debug;

    const debuggerInstance = new AudioDebugger(contextManager.context, busSystem, busSystem.getMasterNode());

    await debuggerInstance.init(options);
}
