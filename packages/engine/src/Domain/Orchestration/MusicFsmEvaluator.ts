import type { IMusicFSMConfig, IMusicTransitionEdge } from '@domain/Configuration/Ports/IMusicFSMConfig.js';
import type { DeepReadonly, IConditionConfig, MusicStateId } from '@scene-grid/shared';

export function evaluateEdges(
    fsmConfig: DeepReadonly<IMusicFSMConfig>,
    currentStateId: MusicStateId,
    checkCondition: (cond: DeepReadonly<IConditionConfig>) => boolean
): DeepReadonly<IMusicTransitionEdge> | null {
    const globalEdge = findActiveEdge(fsmConfig.globalEdges, checkCondition);
    if (globalEdge) return globalEdge;

    const currentNode = fsmConfig.states[currentStateId];

    return currentNode?.edges ? findActiveEdge(currentNode.edges, checkCondition) : null;
}

function findActiveEdge(
    edges: DeepReadonly<IMusicTransitionEdge[]>,
    checkCondition: (cond: DeepReadonly<IConditionConfig>) => boolean
): DeepReadonly<IMusicTransitionEdge> | null {
    const length = edges.length;

    for (let i = 0; i < length; i++) {
        const edge = edges[i];
        if (evaluateConditions(edge.conditions, checkCondition)) return edge;
    }

    return null;
}

function evaluateConditions(
    conditions: DeepReadonly<IConditionConfig[]>,
    checkCondition: (cond: DeepReadonly<IConditionConfig>) => boolean
): boolean {
    const length = conditions.length;

    for (let i = 0; i < length; i++) {
        if (!checkCondition(conditions[i])) return false;
    }

    return true;
}
