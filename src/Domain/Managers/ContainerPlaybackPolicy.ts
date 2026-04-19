import type { ContainerMode, IContainerSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type {
    IContainerEvaluationResult,
    IContainerPlaybackState
} from '@domain/Managers/Ports/IContainerPlaybackState.js';

export default class ContainerPlaybackPolicy {
    public evaluateNext(
        config: IContainerSoundConfig,
        currentState?: IContainerPlaybackState
    ): IContainerEvaluationResult {
        const sources = config.sources;

        if (!sources || sources.length === 0) {
            return {
                soundId: null,
                nextState: { lastPlayedIndex: -1 }
            };
        }

        if (sources.length === 1) {
            return {
                soundId: sources[0],
                nextState: { lastPlayedIndex: 0 }
            };
        }

        const lastIndex = currentState?.lastPlayedIndex ?? -1;
        const nextIndex = this.calculateNextIndex(config.mode, sources.length, lastIndex);

        return {
            soundId: sources[nextIndex],
            nextState: { lastPlayedIndex: nextIndex }
        };
    }

    private calculateNextIndex(mode: ContainerMode, length: number, lastIndex: number): number {
        switch (mode) {
            case 'sequence': {
                return (lastIndex + 1) % length;
            }

            case 'random': {
                return Math.floor(Math.random() * length);
            }

            case 'random_no_repeat': {
                let newIndex;
                do {
                    newIndex = Math.floor(Math.random() * length);
                } while (newIndex === lastIndex);
                return newIndex;
            }

            default: {
                return 0;
            }
        }
    }
}
