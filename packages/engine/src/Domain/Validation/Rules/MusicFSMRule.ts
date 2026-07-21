// oxlint-disable max-depth max-lines-per-function
// noinspection D

import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import { type DeepReadonly, isAbsent, MusicStateId } from '@scene-grid/shared';
import type { IMusicStateNode, IMusicTransitionEdge } from '@domain/Configuration/Ports/IMusicFSMConfig';

export default class MusicFSMRule implements IValidationRule {
    public validate(context: IValidationContext) {
        if (isAbsent(context.config.musicFSM) || Object.keys(context.config.musicFSM).length === 0) return;

        const fsm = context.config.musicFSM;
        const pathBase = 'musicFSM';

        if (!context.assertRequiredType(`${pathBase}.initialState`, fsm.initialState, 'string')) return;
        context.assertArray(`${pathBase}.globalEdges`, fsm.globalEdges, false);

        if (isAbsent(fsm.states) || typeof fsm.states !== 'object') {
            context.addError(`${pathBase}.states must be an object.`);
            return;
        }

        if (!(fsm.initialState in fsm.states)) {
            context.addError(`${pathBase}.initialState "${fsm.initialState}" is missing from states dictionary.`);
        }

        if (fsm.globalEdges) {
            const globalLen = fsm.globalEdges.length;
            for (let i = 0; i < globalLen; i++) {
                this.validateMusicEdge(context, `${pathBase}.globalEdges[${i}]`, fsm.globalEdges[i], fsm.states);
            }
        }

        const stateIds = Object.keys(fsm.states) as MusicStateId[];
        const statesLen = stateIds.length;

        for (let i = 0; i < statesLen; i++) {
            const stateId = stateIds[i];
            const node = fsm.states[stateId];
            const nodePath = `${pathBase}.states.${stateId}`;

            if (isAbsent(node) || typeof node !== 'object') {
                context.addError(`${nodePath} must be an object.`);
                continue;
            }

            if (context.assertRequiredType(`${nodePath}.soundId`, node.soundId, 'string')) {
                const soundCfg = context.config.soundMap[node.soundId];
                if (isAbsent(soundCfg)) {
                    context.addError(`${nodePath}.soundId "${node.soundId}" does not exist in soundMap.`);
                } else if (!context.isSmartLoop(soundCfg)) {
                    context.addError(
                        `${nodePath}.soundId "${node.soundId}" is linked to MusicFSM, but its config type in soundMap is NOT smartLoop.`
                    );
                } else {
                    if (context.assertRequiredType(`${nodePath}.sequencerRegion`, node.sequencerRegion, 'string')) {
                        if (isAbsent(soundCfg.smartLoop.regions[node.sequencerRegion])) {
                            context.addError(
                                `${nodePath}.sequencerRegion "${node.sequencerRegion}" is missing from smartLoop.regions inside sound "${node.soundId}".`
                            );
                        }
                    }
                }
            }

            if (node.activeSnapshot !== undefined) {
                if (context.assertRequiredType(`${nodePath}.activeSnapshot`, node.activeSnapshot, 'string')) {
                    if (isAbsent(context.config.snapshots[node.activeSnapshot])) {
                        context.addError(
                            `${nodePath}.activeSnapshot "${node.activeSnapshot}" does not exist in global snapshots configuration.`
                        );
                    }
                }
            }

            if (context.assertArray(`${nodePath}.edges`, node.edges, true) && node.edges) {
                const localEdgesLen = node.edges.length;
                for (let j = 0; j < localEdgesLen; j++) {
                    this.validateMusicEdge(context, `${nodePath}.edges[${j}]`, node.edges[j], fsm.states);
                }
            }
        }
    }

    private validateMusicEdge(
        context: IValidationContext,
        path: string,
        edge: DeepReadonly<IMusicTransitionEdge>,
        states: DeepReadonly<Record<MusicStateId, IMusicStateNode>>
    ): void {
        if (isAbsent(edge) || typeof edge !== 'object') {
            context.addError(`${path} must be an object.`);
            return;
        }

        if (!context.assertRequiredType(`${path}.targetState`, edge.targetState, 'string')) return;

        const targetNode = states[edge.targetState];
        if (isAbsent(targetNode)) {
            context.addError(`${path}.targetState "${edge.targetState}" points to a non-existent state node.`);
            return;
        }

        if (edge.transitionRegionName !== undefined && edge.transitionRegionName !== '') {
            if (isAbsent(targetNode.soundId)) {
                context.addError(
                    `${path}.transitionRegionName is set, but target state "${edge.targetState}" is missing soundId.`
                );
            } else {
                const targetSoundCfg = context.config.soundMap[targetNode.soundId];

                if (isAbsent(targetSoundCfg)) {
                    context.addError(
                        `${path}.transitionRegionName points to soundId "${targetNode.soundId}" which does not exist in soundMap.`
                    );
                } else if (!context.isSmartLoop(targetSoundCfg)) {
                    context.addError(
                        `${path}.transitionRegionName requires target sound "${targetNode.soundId}" to be a smartLoop.`
                    );
                } else {
                    const regions = targetSoundCfg.smartLoop.regions;
                    if (isAbsent(regions) || isAbsent(regions[edge.transitionRegionName])) {
                        context.addError(
                            `${path}.transitionRegionName "${edge.transitionRegionName}" is missing from smartLoop.regions inside sound "${targetNode.soundId}".`
                        );
                    }
                }
            }
        }

        if (edge.stingerId !== undefined) {
            if (context.assertRequiredType(`${path}.stingerId`, edge.stingerId, 'string')) {
                if (isAbsent(context.config.soundMap[edge.stingerId])) {
                    context.addError(`${path}.stingerId "${edge.stingerId}" does not exist in soundMap.`);
                }
            }
        }

        if (context.assertArray(`${path}.conditions`, edge.conditions, false) && edge.conditions) {
            const condsLen = edge.conditions.length;
            for (let i = 0; i < condsLen; i++) {
                const cond = edge.conditions[i];
                const condPath = `${path}.conditions[${i}]`;

                if (isAbsent(cond) || typeof cond !== 'object') {
                    context.addError(`${condPath} must be an object.`);
                    continue;
                }

                if (context.assertRequiredType(`${condPath}.param`, cond.param, 'string')) {
                    if (isAbsent(context.config.rtpcManifest[cond.param])) {
                        context.addError(`${condPath}.param "${cond.param}" is missing from global RTPCManifest.`);
                    }
                }
            }
        }
    }
}
