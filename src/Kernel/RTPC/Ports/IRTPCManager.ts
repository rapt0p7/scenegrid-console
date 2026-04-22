import { GameParamId } from '@shared/Types/Branded.js';
import { DeepReadonly } from '@shared/DeepReadonly.js';

export interface IRTPCManager {
    setValue(parameterName: GameParamId, value: number): void;
    setValues(parameters: DeepReadonly<Record<GameParamId, number>>): void;
    getValue(parameterName: GameParamId, defaultValue?: number): number;
    configureParam(parameterName: GameParamId, attackMs: number, releaseMs: number): void;
    tick(currentTime: number, deltaTimeMs: number): void;
    reset(): void;
}
