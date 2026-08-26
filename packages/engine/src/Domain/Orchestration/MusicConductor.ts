// oxlint-disable max-lines-per-function
// noinspection D

import type { IMusicFSMConfig, IMusicTransitionEdge } from '@domain/Configuration/Ports/IMusicFSMConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type MixerSnapshotManager from '@domain/Mixer/MixerSnapshotManager.js';
import type { IConductorState } from '@domain/Orchestration/Ports/IConductorState.js';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { ContextTime, DeepReadonly, IConditionConfig, LayerId, Milliseconds, Pulses } from '@scene-grid/shared';

import { evaluateEdges } from '@domain/Orchestration/MusicFsmEvaluator.js';
import { ConditionEvaluator } from '@domain/Shared/Evaluators/ConditionEvaluator.js';

export class MusicConductor implements ITickable {
    public static readonly TICK_DIVIDER: number = 1;
    private readonly state: IConductorState;
    private config!: DeepReadonly<IMusicFSMConfig>;
    private readonly conductorMixerLayer = 'music_fsm' as LayerId;
    private readonly conductorMixerPriority = 100;
    private isRunning = false;

    constructor(
        private readonly sequencer: ISequencer,
        private readonly mixer: MixerSnapshotManager,
        private readonly rtpc: IRTPCAdapter
    ) {
        this.state = {
            currentStateId: '' as any,
            isTransitioning: false,
            pendingMixer: {
                isActive: false,
                executionTime: 0,
                snapshotId: '' as any,
                crossfade: 0 as Milliseconds
            }
        };
    }

    public init(config: DeepReadonly<IMusicFSMConfig>): void {
        this.config = config;
        this.state.currentStateId = config.initialState;
        this.state.isTransitioning = false;
        this.state.pendingMixer.isActive = false;
        this.isRunning = false;
    }

    public start(): void {
        if (this.isRunning) return;

        const startNode = this.config.states[this.state.currentStateId];
        if (startNode) {
            this.sequencer.playLoop(startNode.soundId, startNode.sequencerRegion);
            if (startNode.activeSnapshot) {
                this.mixer.activateSnapshot(
                    startNode.activeSnapshot,
                    this.conductorMixerLayer,
                    this.conductorMixerPriority,
                    0 as Milliseconds
                );
            }
        }

        this.isRunning = true;
    }

    public stop(): void {
        if (!this.isRunning) return;

        const currentNode = this.config.states[this.state.currentStateId];
        if (currentNode) {
            this.sequencer.stopLoop(currentNode.soundId);
        }

        this.isRunning = false;
        this.state.pendingMixer.isActive = false;
        this.state.isTransitioning = false;
    }

    public tick(currentTime: ContextTime): void {
        if (!this.isRunning) return;

        const pm = this.state.pendingMixer;

        if (pm.isActive && currentTime >= pm.executionTime) {
            this.mixer.activateSnapshot(
                pm.snapshotId,
                this.conductorMixerLayer,
                this.conductorMixerPriority,
                pm.crossfade
            );
            pm.isActive = false;
            this.state.isTransitioning = false;
        }

        if (!this.state.isTransitioning) {
            const triggeredEdge = evaluateEdges(this.config, this.state.currentStateId, this.checkCondition);

            if (triggeredEdge) {
                this.executeTransition(triggeredEdge, currentTime);
            }
        }
    }

    private readonly checkCondition = (cond: DeepReadonly<IConditionConfig>): boolean => {
        const value = this.rtpc.getValue(cond.param);
        return ConditionEvaluator.evaluate(value, cond.operator, cond.value);
    };

    private executeTransition(edge: DeepReadonly<IMusicTransitionEdge>, currentTime: ContextTime): void {
        const targetNode = this.config.states[edge.targetState];
        if (!targetNode) return;

        const currentNode = this.config.states[this.state.currentStateId];

        this.sequencer.transitionTo({
            soundId: targetNode.soundId,
            targetRegion: targetNode.sequencerRegion,
            transitionRegionName: edge.transitionRegionName,
            options: {
                quantize: edge.syncRule,
                crossfadeDuration: edge.crossfadeDuration,
                interruptable: edge.interruptable
            }
        });

        if (edge.stingerId) {
            this.sequencer.playStinger(edge.stingerId, edge.syncRule, targetNode.soundId);
        }

        if (targetNode.activeSnapshot) {
            let targetTime = currentTime;

            if (edge.syncRule !== 'Immediate' && currentNode) {
                const playbackInfo = this.sequencer.getPlaybackInfo(currentNode.soundId);

                if (playbackInfo) {
                    const grid = playbackInfo.grid;
                    const rule = edge.syncRule;

                    if (typeof rule === 'string') {
                        targetTime =
                            rule === 'NextBar' ? grid.getNextBarTime(currentTime) : grid.getNextBeatTime(currentTime);
                    } else if (rule.type === 'NextGridDivision') {
                        targetTime = grid.getNextDivisionTime(currentTime, rule.division);
                    } else if (rule.type === 'ExactPulse') {
                        const currentPulse = grid.getPulseAtTime(currentTime);
                        targetTime = grid.getTimeAtPulse((currentPulse + rule.pulseOffset) as Pulses);
                    }
                }
            }

            const pm = this.state.pendingMixer;
            pm.isActive = true;
            pm.executionTime = targetTime;
            pm.snapshotId = targetNode.activeSnapshot;
            pm.crossfade = edge.crossfadeDuration ?? (0 as Milliseconds);

            this.state.isTransitioning = true;
        }

        this.state.currentStateId = targetNode.id;
    }
}
