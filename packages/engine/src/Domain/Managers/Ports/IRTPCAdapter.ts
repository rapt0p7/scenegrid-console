import { GameParamId } from '@scene-grid/shared';

export interface IRTPCAdapter {
    getValue(parameterName: GameParamId, defaultValue?: number): number;
    setValue(parameterName: GameParamId, value: number): void;
}
