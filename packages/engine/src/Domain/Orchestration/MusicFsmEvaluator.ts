import type { DeepReadonly, IConditionConfig, MusicStateId } from '@scene-grid/shared';
import type { IMusicFSMConfig, IMusicTransitionEdge } from '@domain/Configuration/Ports/IMusicFSMConfig.js';

export function evaluateEdges(
    fsmConfig: DeepReadonly<IMusicFSMConfig>,
    currentStateId: MusicStateId,
    checkCondition: (cond: DeepReadonly<IConditionConfig>) => boolean
): DeepReadonly<IMusicTransitionEdge> | null {
    let edge = findActiveEdge(fsmConfig.globalEdges, checkCondition);

    if (edge) return edge;

    const currentNode = fsmConfig.states[currentStateId];

    if (currentNode?.edges) {
        edge = findActiveEdge(currentNode.edges, checkCondition);

        if (edge) return edge;
    }

    return null;
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

    if (length === 0) return true;

    for (let i = 0; i < length; i++) {
        if (!checkCondition(conditions[i])) return false;
    }

    return true;
}
