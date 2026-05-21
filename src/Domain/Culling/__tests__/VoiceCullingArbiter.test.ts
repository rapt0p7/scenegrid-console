// noinspection D
import { describe, it, expect, beforeEach } from 'vitest';

import { VoiceCullingArbiter } from '../VoiceCullingArbiter.js';

import type { ICullingContext } from '../Ports/ICullingArbiter.js';
import type { BusId, PlaybackId, SoundId } from '@shared/Types/Branded.js';

describe('VoiceCullingArbiter (Pure Domain Logic & Hysteresis)', () => {
    let arbiter: VoiceCullingArbiter;
    let mockContext: ICullingContext;

    let activePlaybacks: PlaybackId[];
    let playbackStates: Record<number, 'playing' | 'virtual' | 'stopped' | 'paused'>;
    let logicalStates: Record<number, 'playing' | 'paused'>;
    let soundIds: Record<number, SoundId>;
    let soundRouting: Record<string, BusId>;
    let busVolumes: Record<string, number>;
    let ghostStates: Record<number, boolean>;

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const HYSTERESIS_MS = 1000;

    beforeEach(() => {
        arbiter = new VoiceCullingArbiter(0.01, HYSTERESIS_MS);

        activePlaybacks = [];
        playbackStates = {};
        logicalStates = {};
        soundIds = {};
        soundRouting = {};
        busVolumes = {};
        ghostStates = {};

        mockContext = {
            get activePlaybacks() {
                return activePlaybacks;
            },
            getSoundId: id => soundIds[id as number],
            getPlaybackState: id => playbackStates[id as number] || 'stopped',
            getLogicalState: id => logicalStates[id as number],
            resolveBusId: id => soundRouting[id as string],
            getBusVolume: id => busVolumes[id as string] ?? 1,
            isGhostVoice: id => ghostStates[id as number] || false
        };
    });

    // eslint-disable-next-line max-params
    function addMockPlayback(
        id: number,
        soundId: string,
        busId: string,
        physicalState: 'playing' | 'virtual' | 'paused' | 'stopped',
        logicalState: 'playing' | 'paused',
        volume: number
    ) {
        const pId = id as PlaybackId;
        const sId = soundId as SoundId;
        const bId = busId as BusId;

        if (!activePlaybacks.includes(pId)) {
            activePlaybacks.push(pId);
        }
        soundIds[id] = sId;
        soundRouting[soundId] = bId;
        playbackStates[id] = physicalState;
        logicalStates[id] = logicalState;
        busVolumes[busId] = volume;

        return pId;
    }

    function setVolume(busId: string, volume: number) {
        busVolumes[busId] = volume;
    }

    describe('Basic Culling Decisions', () => {
        it('should return empty decisions if no sounds are playing', () => {
            const decisions = arbiter.evaluate(mockContext, 500);
            expect(decisions.toVirtualize).toHaveLength(0);
            expect(decisions.toDevirtualize).toHaveLength(0);
        });

        it('should recommend to VIRTUALIZE a playing sound when its bus volume drops below threshold AND hysteresis time passes', () => {
            const pId = addMockPlayback(1, 'violins', 'music', 'playing', 'playing', 0.005);

            const decisions = arbiter.evaluate(mockContext, 1500);

            expect(decisions.toVirtualize).toContain(pId);
            expect(decisions.toDevirtualize).toHaveLength(0);
        });

        it('should recommend to DEVIRTUALIZE a sleeping sound when its bus volume rises above threshold INSTANTLY', () => {
            const pId = addMockPlayback(1, 'violins', 'music', 'virtual', 'playing', 1);

            const decisions = arbiter.evaluate(mockContext, 0);

            expect(decisions.toDevirtualize).toContain(pId);
            expect(decisions.toVirtualize).toHaveLength(0);
        });

        it('should VIRTUALIZE a paused sound if its bus volume drops below threshold (to free up pool slots)', () => {
            const pId = addMockPlayback(1, 'ambient', 'bg', 'paused', 'paused', 0);

            const decisions = arbiter.evaluate(mockContext, 1500);

            expect(decisions.toVirtualize).toContain(pId);
            expect(decisions.toDevirtualize).toHaveLength(0);
        });

        it('should NOT DEVIRTUALIZE a sleeping sound if its bus volume rises BUT its logical state is paused', () => {
            addMockPlayback(1, 'ambient', 'bg', 'virtual', 'paused', 1);

            const decisions = arbiter.evaluate(mockContext, 500);

            expect(decisions.toDevirtualize).toHaveLength(0);
            expect(decisions.toVirtualize).toHaveLength(0);
        });
    });

    describe('Ghost Voices (Scatterer Protection)', () => {
        it('should completely ignore ghost voices and not track them in muteTimers', () => {
            const pId = addMockPlayback(99, 'scatterer', 'bg', 'stopped', 'playing', 0);

            ghostStates[pId] = true;

            const decisions = arbiter.evaluate(mockContext, HYSTERESIS_MS + 100);

            expect(decisions.toVirtualize).toHaveLength(0);
            expect(decisions.toDevirtualize).toHaveLength(0);

            expect((arbiter as any).muteTimers.has(pId)).toBe(false);
        });
    });

    describe('Hysteresis (Anti-Flutter) Mechanics', () => {
        it('should accumulate time and delay virtualization until hysteresis threshold is met', () => {
            const pId = addMockPlayback(1, 'drone', 'bg', 'playing', 'playing', 0); // Тихий звук

            let decisions = arbiter.evaluate(mockContext, 500);
            expect(decisions.toVirtualize).not.toContain(pId);

            decisions = arbiter.evaluate(mockContext, 400);
            expect(decisions.toVirtualize).not.toContain(pId);

            decisions = arbiter.evaluate(mockContext, 100);
            expect(decisions.toVirtualize).toContain(pId);
        });

        it('should reset hysteresis timer instantly if volume spikes back up (Anti-Flutter)', () => {
            const pId = addMockPlayback(1, 'drone', 'bg', 'playing', 'playing', 0);

            arbiter.evaluate(mockContext, 800);

            setVolume('bg', 0.5);

            arbiter.evaluate(mockContext, 200);

            setVolume('bg', 0);

            const decisions = arbiter.evaluate(mockContext, 300);
            expect(decisions.toVirtualize).not.toContain(pId);
        });

        it('should safely clean up timers for playbacks that have naturally ended (Memory Leak Prevention)', () => {
            addMockPlayback(1, 'laser', 'sfx', 'playing', 'playing', 0);

            arbiter.evaluate(mockContext, 500);
            expect((arbiter as any).muteTimers.has(1)).toBe(true);

            activePlaybacks.length = 0;

            arbiter.evaluate(mockContext, 500);

            expect((arbiter as any).muteTimers.has(1)).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        it('should DO NOTHING if state and volume already match', () => {
            addMockPlayback(1, 'explosion', 'sfx', 'playing', 'playing', 0.8);
            const decisions1 = arbiter.evaluate(mockContext, 1000);
            expect(decisions1.toVirtualize).toHaveLength(0);
            expect(decisions1.toDevirtualize).toHaveLength(0);

            addMockPlayback(2, 'ambient', 'bg', 'virtual', 'playing', 0);
            const decisions2 = arbiter.evaluate(mockContext, 1000);
            expect(decisions2.toVirtualize).toHaveLength(0);
            expect(decisions2.toDevirtualize).toHaveLength(0);
        });

        it('should NOT affect sounds on other buses that are still loud', () => {
            const quietId = addMockPlayback(1, 'violins', 'music', 'playing', 'playing', 0);
            addMockPlayback(2, 'explosion', 'sfx', 'playing', 'playing', 1);

            const decisions = arbiter.evaluate(mockContext, 1500);

            expect(decisions.toVirtualize).toContain(quietId);
            expect(decisions.toVirtualize).toHaveLength(1);
        });

        it('should safely ignore playbacks with unknown soundIds or busIds', () => {
            activePlaybacks.push(999 as PlaybackId);
            let decisions = arbiter.evaluate(mockContext, 1000);
            expect(decisions.toVirtualize).toHaveLength(0);

            addMockPlayback(3, 'orphan', 'unknown_bus', 'playing', 'playing', 1);
            delete soundRouting['orphan'];
            decisions = arbiter.evaluate(mockContext, 1000);
            expect(decisions.toVirtualize).toHaveLength(0);
        });
    });
});
