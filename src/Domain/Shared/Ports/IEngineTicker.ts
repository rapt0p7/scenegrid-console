export interface IEngineTicker {
    add(id: string, intervalMs: number, callback: (currentTime: number, deltaTimeMs: number) => void): void;
    remove(id: string): void;
    start(): void;
    stop(): void;
}
