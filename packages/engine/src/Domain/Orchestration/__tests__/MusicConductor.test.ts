// oxlint-disable max-lines-per-function
// noinspection D

import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { MusicConductor } from '../MusicConductor.js';

import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import type MixerSnapshotManager from '@domain/Mixer/MixerSnapshotManager.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { IMusicFSMConfig } from '@domain/Configuration/Ports/IMusicFSMConfig.js';
import type { GameParamId, MusicStateId, RegionId, SnapshotId, SoundId } from '@scene-grid/shared';
import { ConditionEvaluator } from '@domain/Shared/Evaluators/ConditionEvaluator.js';
import * as MusicFsmEvaluator from '@domain/Orchestration/MusicFsmEvaluator.js';

vi.mock('@domain/Shared/Evaluators/ConditionEvaluator.js', () => ({
    ConditionEvaluator: {
        evaluate: vi.fn()
    }
}));

describe('MusicConductor (Exhaustive Architectural Test Suite)', () => {
    let sequencer: Mocked<ISequencer>;
    let mixer: Mocked<MixerSnapshotManager>;
    let rtpc: Mocked<IRTPCAdapter>;
    let conductor: MusicConductor;

    const mockGrid = {
        getNextBeatTime: vi.fn(),
        getNextBarTime: vi.fn(),
        getNextDivisionTime: vi.fn(),
        getPulseAtTime: vi.fn(),
        getTimeAtPulse: vi.fn()
    };

    const mockConfig: IMusicFSMConfig = {
        initialState: 'idle' as MusicStateId,
        globalEdges: [],
        states: {
            ['idle' as MusicStateId]: {
                id: 'idle' as MusicStateId,
                soundId: 'sys_music' as SoundId,
                sequencerRegion: 'region_idle' as RegionId,
                activeSnapshot: 'snap_idle' as SnapshotId,
                edges: []
            },
            ['combat' as MusicStateId]: {
                id: 'combat' as MusicStateId,
                soundId: 'sys_music' as SoundId,
                sequencerRegion: 'region_combat' as RegionId,
                activeSnapshot: 'snap_combat' as SnapshotId,
                edges: []
            },
            ['no_snapshot' as MusicStateId]: {
                id: 'no_snapshot' as MusicStateId,
                soundId: 'sys_music' as SoundId,
                sequencerRegion: 'region_stealth' as RegionId,
                edges: []
            }
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();

        sequencer = {
            playLoop: vi.fn(),
            stopLoop: vi.fn(),
            transitionTo: vi.fn(),
            playStinger: vi.fn(),
            getPlaybackInfo: vi.fn().mockReturnValue({ grid: mockGrid })
        } as unknown as Mocked<ISequencer>;

        mixer = {
            activateSnapshot: vi.fn()
        } as unknown as Mocked<MixerSnapshotManager>;

        rtpc = {
            getValue: vi.fn().mockReturnValue(0)
        } as unknown as Mocked<IRTPCAdapter>;

        conductor = new MusicConductor(sequencer, mixer, rtpc);
    });

    describe('1. Lifecycle & Initialization (init, start, stop)', () => {
        it('should only set configuration and state on init without starting playback', () => {
            conductor.init(mockConfig);

            expect(sequencer.playLoop).not.toHaveBeenCalled();
            expect(mixer.activateSnapshot).not.toHaveBeenCalled();

            const state = (conductor as any).state;
            expect(state.currentStateId).toBe('idle');
            expect(state.isTransitioning).toBe(false);
            expect(state.pendingMixer.isActive).toBe(false);
            expect((conductor as any).isRunning).toBe(false);
        });

        it('should trigger playback only on start when not already running', () => {
            conductor.init(mockConfig);
            conductor.start();

            expect(sequencer.playLoop).toHaveBeenCalledWith('sys_music', 'region_idle');
            expect(mixer.activateSnapshot).toHaveBeenCalledWith('snap_idle', 'music_fsm', 100, 0);
            expect((conductor as any).isRunning).toBe(true);

            vi.clearAllMocks();
            conductor.start();
            expect(sequencer.playLoop).not.toHaveBeenCalled();
        });

        it('should safely start even if initial state has no snapshot', () => {
            const configWithoutSnap = { ...mockConfig, initialState: 'no_snapshot' as MusicStateId };
            conductor.init(configWithoutSnap);
            conductor.start();

            expect(sequencer.playLoop).toHaveBeenCalledWith('sys_music', 'region_stealth');
            expect(mixer.activateSnapshot).not.toHaveBeenCalled();
        });

        it('should not crash if initial state is totally missing in config (resilience)', () => {
            const brokenConfig = { ...mockConfig, initialState: 'ghost' as MusicStateId };
            conductor.init(brokenConfig);
            expect(() => {
                conductor.start();
            }).not.toThrow();
        });

        it('should stop playback and clear pending state on stop', () => {
            conductor.init(mockConfig);
            conductor.start();

            (conductor as any).state.pendingMixer.isActive = true;
            (conductor as any).state.isTransitioning = true;

            conductor.stop();

            expect(sequencer.stopLoop).toHaveBeenCalledWith('sys_music');
            expect((conductor as any).isRunning).toBe(false);
            expect((conductor as any).state.pendingMixer.isActive).toBe(false);
            expect((conductor as any).state.isTransitioning).toBe(false);

            vi.clearAllMocks();
            conductor.stop();
            expect(sequencer.stopLoop).not.toHaveBeenCalled();
        });

        it('should ignore tick if conductor is not running', () => {
            conductor.init(mockConfig);
            const evalSpy = vi.spyOn(MusicFsmEvaluator, 'evaluateEdges');

            conductor.tick(10.0);

            expect(evalSpy).not.toHaveBeenCalled();
        });
    });

    describe('2. CheckCondition & RTPC Binding (Zero Allocation Callback)', () => {
        it('should successfully read RTPC and delegate to ConditionEvaluator', () => {
            conductor.init(mockConfig);

            const checkFn = (conductor as any).checkCondition;

            rtpc.getValue.mockReturnValue(75);
            vi.mocked(ConditionEvaluator.evaluate).mockReturnValue(true);

            const testCondition = { param: 'hp' as GameParamId, operator: '<=', value: 100 } as any;
            const result = checkFn(testCondition);

            expect(rtpc.getValue).toHaveBeenCalledWith('hp');
            expect(ConditionEvaluator.evaluate).toHaveBeenCalledWith(75, '<=', 100);
            expect(result).toBe(true);
        });
    });

    describe('3. Execution & Sequencer Delegation (0 Bytes Overhead)', () => {
        beforeEach(() => {
            conductor.init(mockConfig);
            conductor.start();
        });

        it('should exactly map edge parameters to Sequencer.transitionTo', () => {
            const edge = {
                targetState: 'combat' as MusicStateId,
                syncRule: 'NextBar',
                crossfadeDurationMs: 2500,
                transitionRegionName: 'fill_in' as RegionId,
                interruptable: false,
                conditions: []
            } as any;

            vi.spyOn(MusicFsmEvaluator, 'evaluateEdges').mockReturnValue(edge);

            conductor.tick(10.0);

            expect(sequencer.transitionTo).toHaveBeenCalledWith({
                soundId: 'sys_music',
                targetRegion: 'region_combat',
                transitionRegionName: 'fill_in',
                options: {
                    quantize: 'NextBar',
                    crossfadeDuration: 2500,
                    interruptable: false
                }
            });
        });

        it('should trigger Stinger playback via sequencer if configured', () => {
            const edge = { targetState: 'combat', syncRule: 'Immediate', stingerId: 'cymbal' } as any;
            vi.spyOn(MusicFsmEvaluator, 'evaluateEdges').mockReturnValue(edge);

            conductor.tick(10.0);

            expect(sequencer.playStinger).toHaveBeenCalledWith('cymbal', 'Immediate', 'sys_music');
        });

        it('should immediately update currentStateId to prevent double-triggering', () => {
            const edge = { targetState: 'no_snapshot' } as any;
            vi.spyOn(MusicFsmEvaluator, 'evaluateEdges').mockReturnValue(edge);

            conductor.tick(10.0);

            const state = (conductor as any).state;
            expect(state.currentStateId).toBe('no_snapshot');
            expect(state.isTransitioning).toBe(false);
        });
    });

    describe('4. Grid Math Delegation (Sample-Accurate Target Time)', () => {
        beforeEach(() => {
            conductor.init(mockConfig);
            conductor.start();
        });

        it('should calculate targetTime for NextBar using Sequencer Grid', () => {
            const edge = { targetState: 'combat', syncRule: 'NextBar', crossfadeDurationMs: 1000 } as any;
            vi.spyOn(MusicFsmEvaluator, 'evaluateEdges').mockReturnValue(edge);
            mockGrid.getNextBarTime.mockReturnValue(14.5);

            conductor.tick(10.0);

            const state = (conductor as any).state;
            expect(mockGrid.getNextBarTime).toHaveBeenCalledWith(10.0);

            expect(state.pendingMixer.executionTime).toBe(14.5);
            expect(state.pendingMixer.crossfadeMs).toBe(1000);
            expect(state.isTransitioning).toBe(true);
        });

        it('should calculate targetTime for NextGridDivision', () => {
            const edge = { targetState: 'combat', syncRule: { type: 'NextGridDivision', division: '1/8' } } as any;
            vi.spyOn(MusicFsmEvaluator, 'evaluateEdges').mockReturnValue(edge);
            mockGrid.getNextDivisionTime.mockReturnValue(11.125);

            conductor.tick(10.0);

            const state = (conductor as any).state;
            expect(mockGrid.getNextDivisionTime).toHaveBeenCalledWith(10.0, '1/8');
            expect(state.pendingMixer.executionTime).toBe(11.125);
        });

        it('should calculate targetTime for ExactPulse', () => {
            const edge = { targetState: 'combat', syncRule: { type: 'ExactPulse', pulseOffset: 480 } } as any;
            vi.spyOn(MusicFsmEvaluator, 'evaluateEdges').mockReturnValue(edge);
            mockGrid.getPulseAtTime.mockReturnValue(1000);
            mockGrid.getTimeAtPulse.mockReturnValue(12.5);

            conductor.tick(10.0);

            expect(mockGrid.getPulseAtTime).toHaveBeenCalledWith(10.0);
            expect(mockGrid.getTimeAtPulse).toHaveBeenCalledWith(1480);
            expect((conductor as any).state.pendingMixer.executionTime).toBe(12.5);
        });

        it('should fallback to currentTime if syncRule is Immediate', () => {
            const edge = { targetState: 'combat', syncRule: 'Immediate' } as any;
            vi.spyOn(MusicFsmEvaluator, 'evaluateEdges').mockReturnValue(edge);

            conductor.tick(10.5);

            expect((conductor as any).state.pendingMixer.executionTime).toBe(10.5);
        });
    });

    describe('5. FSM Protection & Mixer Commit (isTransitioning)', () => {
        beforeEach(() => {
            conductor.init(mockConfig);
            conductor.start();
        });

        it('should block FSM evaluation while isTransitioning is true', () => {
            const edge = { targetState: 'combat', syncRule: 'NextBar' } as any;
            const evalSpy = vi.spyOn(MusicFsmEvaluator, 'evaluateEdges').mockReturnValue(edge);
            mockGrid.getNextBarTime.mockReturnValue(15.0);

            conductor.tick(10.0);
            expect((conductor as any).state.isTransitioning).toBe(true);

            evalSpy.mockClear();
            conductor.tick(12.0);

            expect(evalSpy).not.toHaveBeenCalled();
            expect(mixer.activateSnapshot).toHaveBeenCalledTimes(1);
        });

        it('should commit Mixer exactly when time arrives and unlock FSM', () => {
            const edge = { targetState: 'combat', syncRule: 'NextBar', crossfadeDurationMs: 500 } as any;
            const evalSpy = vi.spyOn(MusicFsmEvaluator, 'evaluateEdges').mockReturnValue(edge);
            mockGrid.getNextBarTime.mockReturnValue(15.0);

            conductor.tick(10.0);

            evalSpy.mockReturnValue(null);
            evalSpy.mockClear();

            conductor.tick(15.1);

            expect(mixer.activateSnapshot).toHaveBeenCalledWith('snap_combat', 'music_fsm', 100, 500);

            const state = (conductor as any).state;
            expect(state.pendingMixer.isActive).toBe(false);
            expect(state.isTransitioning).toBe(false);

            expect(evalSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('6. GC Safe & Zero Allocation Proof', () => {
        it('should mutate internal state without allocating new objects', () => {
            conductor.init(mockConfig);
            conductor.start();

            const originalStateRef = (conductor as any).state;
            const originalPendingRef = originalStateRef.pendingMixer;

            for (let i = 0; i < 10; i++) {
                const edge = {
                    targetState: i % 2 === 0 ? 'combat' : 'idle',
                    syncRule: 'Immediate',
                    crossfadeDurationMs: 100
                } as any;
                vi.spyOn(MusicFsmEvaluator, 'evaluateEdges').mockReturnValue(edge);

                conductor.tick(i * 10);
            }

            const currentStateRef = (conductor as any).state;
            const currentPendingRef = currentStateRef.pendingMixer;

            expect(currentStateRef).toBe(originalStateRef);
            expect(currentPendingRef).toBe(originalPendingRef);
        });
    });
});
