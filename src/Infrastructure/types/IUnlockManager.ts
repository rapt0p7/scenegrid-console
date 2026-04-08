export interface IUnlockManager {
    readonly isLocked: boolean;
    unlock(event: MouseEvent | TouchEvent): Promise<void>;
    playEmptySound(): void;
}
