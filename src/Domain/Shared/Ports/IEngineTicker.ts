import { TickerTaskId } from '@shared/Types/Branded.js';
import { ITickable } from '@domain/Shared/Ports/ITickable.js';

export interface IEngineTicker {
    add(id: TickerTaskId, intervalMs: number, target: ITickable): void;
    remove(id: string): void;
    start(): void;
    stop(): void;
}
