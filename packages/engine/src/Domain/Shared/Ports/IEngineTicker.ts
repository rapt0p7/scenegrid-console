import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { TickerTaskId } from '@scene-grid/shared';

export interface IEngineTicker {
    add(id: TickerTaskId, divider: number, target: ITickable): void;
    remove(id: string): void;
    start(): void;
    stop(): void;
}
