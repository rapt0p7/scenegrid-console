import type { ContainerSourceItem, IContainerSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type {
    IContainerEvaluationResult,
    IContainerPlaybackState
} from '@domain/Managers/Ports/IContainerPlaybackState.js';
import { isDefined } from '@scene-grid/shared';
import type { IPRNG } from '@scene-grid/shared';

export default class ContainerPlaybackPolicy {
    constructor(private readonly prng: IPRNG) {}
    public evaluateNext(
        config: IContainerSoundConfig,
        currentState?: IContainerPlaybackState
    ): IContainerEvaluationResult {
        const { sources, mode } = config;
        if (!isDefined(sources) || sources.length === 0) return { soundId: null, nextState: { lastPlayedIndex: -1 } };

        const { length } = sources;
        const lastIndex = currentState?.lastPlayedIndex ?? -1;
        const history = currentState?.recentHistory ?? [];

        let nextIndex = 0;

        switch (mode) {
            case 'sequence':
                nextIndex = (lastIndex + 1) % length;
                break;
            case 'random_no_repeat':
                nextIndex = this.calculateNoRepeat(sources, history);
                break;
            case 'random':
            default:
                nextIndex = this.calculateWeightedRandom(sources);
                break;
        }

        const nextHistory = [nextIndex, ...history].slice(0, 2);

        const selected = sources[nextIndex];
        const soundId = typeof selected === 'string' ? selected : selected.id;

        return {
            soundId,
            nextState: { lastPlayedIndex: nextIndex, recentHistory: nextHistory }
        };
    }

    private calculateWeightedRandom(sources: ContainerSourceItem[]): number {
        let totalWeight = 0;
        const weights = sources.map(s => {
            const w = typeof s === 'string' ? 1 : (s.weight ?? 1);
            totalWeight += w;
            return w;
        });

        let r = this.prng.next() * totalWeight;
        const { length } = weights;
        for (let i = 0; i < length; i++) {
            r -= weights[i];
            if (r <= 0) return i;
        }
        return 0;
    }

    private calculateNoRepeat(sources: ContainerSourceItem[], history: number[]): number {
        if (sources.length <= 1) return 0;
        let index: number;
        do {
            index = this.calculateWeightedRandom(sources);
        } while (history.includes(index));
        return index;
    }
}
