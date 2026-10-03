import type { Milliseconds } from '@scene-grid/shared';

import MixerTransitionEngine from '@domain/Mixer/MixerTransitionEngine.js';
import AudioBusSystem from '@infrastructure/busSystem/AudioBusSystem.js';
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const BUS_CONFIG = {
    musicMain: { gain: 1 },
    musicExplore: { gain: 1 },
    musicCombat: { gain: 1 }
};

const IDLE_SNAPSHOT = {
    buses: {
        musicMain: { gain: 1 },
        musicExplore: { gain: 0 },
        musicCombat: { gain: 0 }
    }
};

describe('Integration: Cold Start Audio Leak', () => {
    let busSystem: AudioBusSystem;
    let mixer: MixerTransitionEngine;
    let mockContext: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        const createMockNode = (name: string) => {
            const state = { currentGain: 1 };

            const node = {
                _name: name,
                connect: vi.fn().mockReturnThis(),
                disconnect: vi.fn().mockReturnThis(),
                gain: {
                    get value() {
                        return state.currentGain;
                    },
                    set value(v) {
                        state.currentGain = v;
                    },

                    setValueAtTime: vi.fn().mockImplementation(value => {
                        state.currentGain = value;
                        return node.gain;
                    }),

                    cancelScheduledValues: vi.fn().mockReturnThis(),

                    setTargetAtTime: vi.fn().mockImplementation(value => {
                        state.currentGain = value;
                        return node.gain;
                    })
                }
            };
            return node;
        };

        mockContext = {
            currentTime: 0.1,
            createGain: vi.fn().mockImplementation(() => createMockNode('gain_node')),
            state: 'running'
        };

        const mockAutomation = {
            set: vi.fn().mockImplementation((parameter, value) => {
                parameter.setValueAtTime(value, mockContext.currentTime);
            }),
            ramp: vi.fn()
        };

        busSystem = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation as any,
            masterOutput: { input: createMockNode('master') } as any,
            busConfig: BUS_CONFIG,
            pluginFactory: {
                getFiltersPlugin: () => ({ createNode: () => createMockNode('filter') })
            } as any
        });

        vi.spyOn(busSystem, 'initLimiter').mockImplementation(() => Promise.resolve());

        await busSystem.initialize({ add: vi.fn() } as any);

        mixer = new MixerTransitionEngine(busSystem, {} as any);
    });

    it('should NOT allow leaked audio when playing sounds immediately after setState', async () => {
        mixer.applyState(IDLE_SNAPSHOT, { duration: 0 as Milliseconds });

        const exploreBus = busSystem.getBus('musicExplore' as any);
        const combatBus = busSystem.getBus('musicCombat' as any);

        expect(exploreBus?.inputNode.gain.value).toBe(0);
        expect(combatBus?.inputNode.gain.value).toBe(0);
    });
});
