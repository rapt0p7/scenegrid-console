import { GameParamId } from '@shared/Types/Branded.js';

export interface IRTPCAdapter {
    getValue(parameterName: GameParamId, defaultValue?: number): number;
}
