import type { ContainerMode, IContainerSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { SoundId } from '@domain/Types/Branded';

interface ContainerState {
    lastPlayedIndex: number;
}

export default class ContainerManager {
    private readonly states = new Map<string, ContainerState>();

    public getNextSource(containerId: string, config: IContainerSoundConfig): SoundId | null {
        if (!config.sources || config.sources.length === 0) return null;

        if (config.sources.length === 1) return config.sources[0];

        let state = this.states.get(containerId);
        if (!state) {
            state = { lastPlayedIndex: -1 };
            this.states.set(containerId, state);
        }

        const nextIndex = this.calculateNextIndex(config.mode, config.sources.length, state.lastPlayedIndex);

        state.lastPlayedIndex = nextIndex;
        return config.sources[nextIndex];
    }

    public reset(containerId?: string): void {
        if (containerId) {
            this.states.delete(containerId);
        } else {
            this.states.clear();
        }
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
