import type { GameParamId, DeepReadonly, Milliseconds } from '@scene-grid/shared';

export interface IRTPCManager {
    setValue(parameterName: GameParamId, value: number): void;
    setValues(parameters: DeepReadonly<Record<GameParamId, number>>): void;
    getValue(parameterName: GameParamId, defaultValue?: number): number;
    configureParam(parameterName: GameParamId, attack: Milliseconds, release: Milliseconds): void;
    tick(currentTime: number, deltaTime: Milliseconds): void;
    reset(): void;
}
