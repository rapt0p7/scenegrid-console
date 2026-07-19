import type { Milliseconds, TickerTaskId } from '@scene-grid/shared';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';

export interface IEngineTicker {
    add(id: TickerTaskId, interval: Milliseconds, target: ITickable): void;
    remove(id: string): void;
    start(): void;
    stop(): void;
}
