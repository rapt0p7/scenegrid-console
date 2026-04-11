// noinspection D
import { describe, it, expect, beforeEach } from 'vitest';

import { VoiceCullingArbiter } from '../VoiceCullingArbiter.js';

import type { CullingContext } from '../Ports/ICullingArbiter.js';
import type { BusId, PlaybackId, SoundId } from '@domain/Types/Branded.js';

describe('VoiceCullingArbiter (Pure Domain Logic)', () => {
    let arbiter: VoiceCullingArbiter;
    let mockContext: CullingContext;

    let activePlaybacks: PlaybackId[];
    let playbackStates: Record<number, 'playing' | 'virtual' | 'stopped'>;
    let soundIds: Record<number, SoundId>;
    let soundRouting: Record<string, BusId>;
    let busVolumes: Record<string, number>;

    beforeEach(() => {
        arbiter = new VoiceCullingArbiter(0.01);

        activePlaybacks = [];
        playbackStates = {};
        soundIds = {};
        soundRouting = {};
        busVolumes = {};

        mockContext = {
            get activePlaybacks() {
                return activePlaybacks;
            },
            getSoundId: id => soundIds[id as number],
            getPlaybackState: id => playbackStates[id as number] || 'stopped',
            resolveBusId: id => soundRouting[id],
            getBusVolume: id => busVolumes[id] ?? 1
        };
    });

    // eslint-disable-next-line max-params
    function addMockPlayback(id: number, soundId: string, busId: string, state: 'playing' | 'virtual', volume: number) {
        const pId = id as PlaybackId;
        const sId = soundId as SoundId;
        const bId = busId as BusId;

        activePlaybacks.push(pId);
        soundIds[id] = sId;
        soundRouting[soundId] = bId;
        playbackStates[id] = state;
        busVolumes[busId] = volume;

        return pId;
    }

    it('should return empty decisions if no sounds are playing', () => {
        const decisions = arbiter.evaluate(mockContext);
        expect(decisions.toVirtualize).toHaveLength(0);
        expect(decisions.toDevirtualize).toHaveLength(0);
    });

    it('should recommend to VIRTUALIZE a playing sound when its bus volume drops below threshold', () => {
        const pId = addMockPlayback(1, 'violins', 'music', 'playing', 0.005);

        const decisions = arbiter.evaluate(mockContext);

        expect(decisions.toVirtualize).toContain(pId);
        expect(decisions.toDevirtualize).toHaveLength(0);
    });

    it('should recommend to DEVIRTUALIZE a sleeping sound when its bus volume rises above threshold', () => {
        const pId = addMockPlayback(1, 'violins', 'music', 'virtual', 1);

        const decisions = arbiter.evaluate(mockContext);

        expect(decisions.toDevirtualize).toContain(pId);
        expect(decisions.toVirtualize).toHaveLength(0);
    });

    it('should DO NOTHING if state and volume already match (e.g., loud and playing)', () => {
        addMockPlayback(1, 'explosion', 'sfx', 'playing', 0.8);

        const decisions = arbiter.evaluate(mockContext);

        expect(decisions.toVirtualize).toHaveLength(0);
        expect(decisions.toDevirtualize).toHaveLength(0);
    });

    it('should DO NOTHING if state and volume already match (e.g., muted and virtual)', () => {
        addMockPlayback(1, 'ambient', 'bg', 'virtual', 0);

        const decisions = arbiter.evaluate(mockContext);

        expect(decisions.toVirtualize).toHaveLength(0);
        expect(decisions.toDevirtualize).toHaveLength(0);
    });

    it('should NOT affect sounds on other buses that are still loud', () => {
        const quietId = addMockPlayback(1, 'violins', 'music', 'playing', 0);
        addMockPlayback(2, 'explosion', 'sfx', 'playing', 1);

        const decisions = arbiter.evaluate(mockContext);

        expect(decisions.toVirtualize).toContain(quietId);
        expect(decisions.toVirtualize).toHaveLength(1);
    });

    it('should safely ignore playbacks with unknown soundIds or busIds', () => {
        activePlaybacks.push(999 as PlaybackId);

        const decisions = arbiter.evaluate(mockContext);

        expect(decisions.toVirtualize).toHaveLength(0);
        expect(decisions.toDevirtualize).toHaveLength(0);
    });
});
