import type { Milliseconds } from '@scene-grid/shared';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import MasterOutput from '../MasterOutput.js';

describe('MasterOutput', () => {
    let mockContextManager: any;
    let mockAutomationEngine: any;
    let fakeDestination: any;
    let gainNodes: any[];

    beforeEach(() => {
        vi.clearAllMocks();
        gainNodes = [];

        fakeDestination = { id: 'destination' };

        mockContextManager = {
            context: {
                destination: fakeDestination,
                createGain: vi.fn(() => {
                    const node = {
                        gain: { value: 1 },
                        connect: vi.fn(),
                        disconnect: vi.fn()
                    };
                    gainNodes.push(node);
                    return node;
                })
            }
        };

        mockAutomationEngine = {
            ramp: vi.fn()
        };
    });

    it('should initialize correctly and connect nodes to destination', () => {
        const masterOut = new MasterOutput(mockContextManager, mockAutomationEngine);

        expect(mockContextManager.context.createGain).toHaveBeenCalledTimes(3);

        const [input, masterGain, silentTail] = gainNodes;

        expect(silentTail.gain.value).toBe(0);

        expect(input.connect).toHaveBeenCalledWith(masterGain);
        expect(masterGain.connect).toHaveBeenCalledWith(fakeDestination);
        expect(silentTail.connect).toHaveBeenCalledWith(fakeDestination);

        expect(masterOut.input).toBe(input);
        expect(masterOut.silentTail).toBe(silentTail);
    });

    it('should set volume immediately if fadeTime is 0', () => {
        const masterOut = new MasterOutput(mockContextManager, mockAutomationEngine);
        const [_, masterGain] = gainNodes;

        masterOut.setVolume(0.7);

        expect(masterGain.gain.value).toBe(0.7);
        expect(mockAutomationEngine.ramp).not.toHaveBeenCalled();
    });

    it('should use automation to ramp volume if fadeTime > 0', () => {
        const masterOut = new MasterOutput(mockContextManager, mockAutomationEngine);
        const [_, masterGain] = gainNodes;

        masterOut.setVolume(0.5, 2 as Milliseconds);

        expect(mockAutomationEngine.ramp).toHaveBeenCalledWith(masterGain.gain, 0.5, 2, 'linear');
        expect(masterGain.gain.value).toBe(1);
    });

    it('should mute using default fade of 0.05s', () => {
        const masterOut = new MasterOutput(mockContextManager, mockAutomationEngine);
        const [_, masterGain] = gainNodes;

        masterOut.mute();

        expect(mockAutomationEngine.ramp).toHaveBeenCalledWith(masterGain.gain, 0, 50, 'linear');
    });

    it('should unmute to default (1) or provided value using default fade of 0.05s', () => {
        const masterOut = new MasterOutput(mockContextManager, mockAutomationEngine);
        const [_, masterGain] = gainNodes;

        masterOut.unmute();
        expect(mockAutomationEngine.ramp).toHaveBeenCalledWith(masterGain.gain, 1, 50, 'linear');

        masterOut.unmute(0.8);
        expect(mockAutomationEngine.ramp).toHaveBeenCalledWith(masterGain.gain, 0.8, 50, 'linear');
    });

    it('should disconnect all nodes on dispose', () => {
        const masterOut = new MasterOutput(mockContextManager, mockAutomationEngine);
        const [input, masterGain, silentTail] = gainNodes;

        masterOut.dispose();

        expect(input.disconnect).toHaveBeenCalled();
        expect(masterGain.disconnect).toHaveBeenCalled();
        expect(silentTail.disconnect).toHaveBeenCalled();
    });
});
