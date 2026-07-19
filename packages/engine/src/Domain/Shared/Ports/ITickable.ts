import type { ContextTime, Milliseconds } from '@scene-grid/shared';

export interface ITickable {
    tick(currentTime: ContextTime, deltaTime: Milliseconds): void;
}
