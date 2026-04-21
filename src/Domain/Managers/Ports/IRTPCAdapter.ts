import { GameParamId } from '@domain/Types/Branded.js';

export interface IRTPCAdapter {
    getValue(parameterName: GameParamId, defaultValue?: number): number;
    on(parameterName: GameParamId, handler: (value: number) => void): void;
    off(parameterName: GameParamId, handler: (value: number) => void): void;
}
