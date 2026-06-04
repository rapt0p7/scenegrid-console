export interface ITickable {
    tick(currentTime: number, deltaTimeMs: number): void;
}
