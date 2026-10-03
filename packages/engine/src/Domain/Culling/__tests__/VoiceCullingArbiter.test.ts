import type { BusId, Milliseconds, PlaybackId, SoundId } from '@scene-grid/shared';

// noinspection D
import { describe, it, expect, beforeEach } from 'vitest';

import type { ICullingContext, CullingDecisions } from '../Ports/ICullingArbiter.js';

import { VoiceCullingArbiter } from '../VoiceCullingArbiter.js';

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

    const HYSTERESIS_MS: Milliseconds = 1000 as Milliseconds;

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

    function getActiveVirtIds(decisions: CullingDecisions): PlaybackId[] {
        return decisions.toVirtualize.slice(0, decisions.virtualizeCount).map(d => d.playbackId);
    }

    function getActiveDevirtIds(decisions: CullingDecisions): PlaybackId[] {
        return decisions.toDevirtualize.slice(0, decisions.devirtualizeCount);
    }

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

        if (!activePlaybacks.includes(pId)) activePlaybacks.push(pId);
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
            const decisions = arbiter.evaluate(mockContext, 500 as Milliseconds);
            expect(decisions.virtualizeCount).toBe(0);
            expect(decisions.devirtualizeCount).toBe(0);
        });

        it('should recommend to VIRTUALIZE a playing sound when its bus volume drops below threshold AND hysteresis time passes', () => {
            const pId = addMockPlayback(1, 'violins', 'music', 'playing', 'playing', 0.005);
            const decisions = arbiter.evaluate(mockContext, 1500 as Milliseconds);

            expect(getActiveVirtIds(decisions)).toContain(pId);
            expect(decisions.devirtualizeCount).toBe(0);
        });

        it('should recommend to DEVIRTUALIZE a sleeping sound when its bus volume rises above threshold INSTANTLY', () => {
            const pId = addMockPlayback(1, 'violins', 'music', 'virtual', 'playing', 1);
            const decisions = arbiter.evaluate(mockContext, 0 as Milliseconds);

            expect(getActiveDevirtIds(decisions)).toContain(pId);
            expect(decisions.virtualizeCount).toBe(0);
        });

        it('should VIRTUALIZE a paused sound if its bus volume drops below threshold (to free up pool slots)', () => {
            const pId = addMockPlayback(1, 'ambient', 'bg', 'paused', 'paused', 0);
            const decisions = arbiter.evaluate(mockContext, 1500 as Milliseconds);

            expect(getActiveVirtIds(decisions)).toContain(pId);
            expect(decisions.devirtualizeCount).toBe(0);
        });

        it('should NOT DEVIRTUALIZE a sleeping sound if its bus volume rises BUT its logical state is paused', () => {
            addMockPlayback(1, 'ambient', 'bg', 'virtual', 'paused', 1);
            const decisions = arbiter.evaluate(mockContext, 500 as Milliseconds);

            expect(decisions.virtualizeCount).toBe(0);
            expect(decisions.devirtualizeCount).toBe(0);
        });
    });

    describe('Ghost Voices (Scatterer Protection)', () => {
        it('should completely ignore ghost voices and not track them in muteTimers', () => {
            const pId = addMockPlayback(99, 'scatterer', 'bg', 'stopped', 'playing', 0);
            ghostStates[pId] = true;

            const decisions = arbiter.evaluate(mockContext, (HYSTERESIS_MS + 100) as Milliseconds);

            expect(decisions.virtualizeCount).toBe(0);
            expect(decisions.devirtualizeCount).toBe(0);
            expect((arbiter as any).muteTimers.has(pId)).toBe(false);
        });
    });

    describe('Hysteresis (Anti-Flutter) Mechanics', () => {
        it('should accumulate time and delay virtualization until hysteresis threshold is met', () => {
            const pId = addMockPlayback(1, 'drone', 'bg', 'playing', 'playing', 0);

            let decisions = arbiter.evaluate(mockContext, 500 as Milliseconds);
            expect(getActiveVirtIds(decisions)).not.toContain(pId);

            decisions = arbiter.evaluate(mockContext, 400 as Milliseconds);
            expect(getActiveVirtIds(decisions)).not.toContain(pId);

            decisions = arbiter.evaluate(mockContext, 100 as Milliseconds);
            expect(getActiveVirtIds(decisions)).toContain(pId);
        });

        it('should reset hysteresis timer instantly if volume spikes back up (Anti-Flutter)', () => {
            const pId = addMockPlayback(1, 'drone', 'bg', 'playing', 'playing', 0);

            arbiter.evaluate(mockContext, 800 as Milliseconds);
            setVolume('bg', 0.5);
            arbiter.evaluate(mockContext, 200 as Milliseconds);
            setVolume('bg', 0);

            const decisions = arbiter.evaluate(mockContext, 300 as Milliseconds);
            expect(getActiveVirtIds(decisions)).not.toContain(pId);
        });

        it('should safely clean up timers for playbacks that have naturally ended (Memory Leak Prevention)', () => {
            addMockPlayback(1, 'laser', 'sfx', 'playing', 'playing', 0);

            arbiter.evaluate(mockContext, 500 as Milliseconds);
            expect((arbiter as any).muteTimers.has(1)).toBe(true);

            activePlaybacks.length = 0;
            arbiter.evaluate(mockContext, 500 as Milliseconds);

            expect((arbiter as any).muteTimers.has(1)).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        it('should DO NOTHING if state and volume already match', () => {
            addMockPlayback(1, 'explosion', 'sfx', 'playing', 'playing', 0.8);
            const decisions1 = arbiter.evaluate(mockContext, 1000 as Milliseconds);
            expect(decisions1.virtualizeCount).toBe(0);
            expect(decisions1.devirtualizeCount).toBe(0);

            addMockPlayback(2, 'ambient', 'bg', 'virtual', 'playing', 0);
            const decisions2 = arbiter.evaluate(mockContext, 1000 as Milliseconds);
            expect(decisions2.virtualizeCount).toBe(0);
            expect(decisions2.devirtualizeCount).toBe(0);
        });

        it('should NOT affect sounds on other buses that are still loud', () => {
            const quietId = addMockPlayback(1, 'violins', 'music', 'playing', 'playing', 0);
            addMockPlayback(2, 'explosion', 'sfx', 'playing', 'playing', 1);

            const decisions = arbiter.evaluate(mockContext, 1500 as Milliseconds);

            expect(getActiveVirtIds(decisions)).toContain(quietId);
            expect(decisions.virtualizeCount).toBe(1);
        });

        it('should safely ignore playbacks with unknown soundIds or busIds', () => {
            activePlaybacks.push(999 as PlaybackId);
            let decisions = arbiter.evaluate(mockContext, 1000 as Milliseconds);
            expect(decisions.virtualizeCount).toBe(0);

            addMockPlayback(3, 'orphan', 'unknown_bus', 'playing', 'playing', 1);
            delete soundRouting['orphan'];
            decisions = arbiter.evaluate(mockContext, 1000 as Milliseconds);
            expect(decisions.virtualizeCount).toBe(0);
        });
    });

    describe('Pre-allocated Pool Integrity & Mutation Guarding', () => {
        it('should pre-allocate virtualize decisions with default reason DEAF_BUS', () => {
            const decisions = arbiter.evaluate(mockContext, 0 as Milliseconds);

            expect(decisions.toVirtualize[0].reason).toBe('DEAF_BUS');
        });

        it('should initialize virtualize pool elements with default playbackId and reason', () => {
            const decisions = arbiter.evaluate(mockContext, 0 as Milliseconds);

            expect(decisions.toVirtualize[0]).toEqual({
                playbackId: 0 as PlaybackId,
                reason: 'DEAF_BUS'
            });
        });

        it('should pre-allocate devirtualize pool with capacity equal to maxPlaybacks', () => {
            const decisions = arbiter.evaluate(mockContext, 0 as Milliseconds);

            expect(decisions.toDevirtualize.length).toBe(128);
        });

        it('should not evaluate out-of-bounds indices beyond activePlaybacks length', () => {
            const pId = addMockPlayback(1, 'violins', 'music', 'playing', 'playing', 0);
            soundIds[undefined as any] = 'fallback_sound' as SoundId;
            soundRouting['fallback_sound'] = 'music' as BusId;

            const decisions = arbiter.evaluate(mockContext, 1500 as Milliseconds);

            expect(decisions.virtualizeCount).toBe(1);
            expect(decisions.toVirtualize[0].playbackId).toBe(pId);
        });

        it('should skip playbacks with missing soundId even if resolveBusId handles undefined', () => {
            activePlaybacks.push(1 as PlaybackId);
            soundRouting['undefined'] = 'music' as BusId;
            busVolumes['music'] = 0;

            const decisions = arbiter.evaluate(mockContext, 1500 as Milliseconds);

            expect(decisions.virtualizeCount).toBe(0);
        });

        it('should treat volume exactly equal to cullingThreshold as muted and virtualize after hysteresis', () => {
            const pId = addMockPlayback(1, 'violins', 'music', 'playing', 'playing', 0.01);

            const decisions = arbiter.evaluate(mockContext, 1500 as Milliseconds);

            expect(decisions.virtualizeCount).toBe(1);
            expect(getActiveVirtIds(decisions)).toContain(pId);
        });

        it('should ignore virtual playbacks with unresolved busId and not devirtualize them', () => {
            addMockPlayback(1, 'orphan', 'unknown_bus', 'virtual', 'playing', 1);
            delete soundRouting['orphan'];

            const decisions = arbiter.evaluate(mockContext, 1000 as Milliseconds);

            expect(decisions.devirtualizeCount).toBe(0);
        });

        it('should NOT recommend virtualization for playbacks already in virtual or stopped state', () => {
            addMockPlayback(1, 'drone', 'bg', 'virtual', 'playing', 0);
            addMockPlayback(2, 'sfx', 'bg', 'stopped', 'playing', 0);

            const decisions = arbiter.evaluate(mockContext, 1500 as Milliseconds);

            expect(decisions.virtualizeCount).toBe(0);
        });

        it('should set decision reason to DEAF_BUS when virtualizing a muted voice', () => {
            addMockPlayback(1, 'violins', 'music', 'playing', 'playing', 0);

            const decisions = arbiter.evaluate(mockContext, 1500 as Milliseconds);

            expect(decisions.virtualizeCount).toBe(1);
            expect(decisions.toVirtualize[0].reason).toBe('DEAF_BUS');
        });

        it('should accurately increment devirtualizeCount and populate devirtualizePool sequentially', () => {
            const pId1 = addMockPlayback(1, 'violins', 'music', 'virtual', 'playing', 1);
            const pId2 = addMockPlayback(2, 'flute', 'music', 'virtual', 'playing', 1);

            const decisions = arbiter.evaluate(mockContext, 0 as Milliseconds);

            expect(decisions.devirtualizeCount).toBe(2);
            expect(decisions.toDevirtualize[0]).toBe(pId1);
            expect(decisions.toDevirtualize[1]).toBe(pId2);
        });
    });
});
