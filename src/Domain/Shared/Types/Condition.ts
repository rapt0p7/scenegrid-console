import type { GameParamId } from '@shared/Types/Branded.js';

export type ConditionOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';

export interface IConditionConfig {
    readonly param: GameParamId;
    readonly operator: ConditionOperator;
    readonly value: number;
    readonly hysteresis?: number;
}
