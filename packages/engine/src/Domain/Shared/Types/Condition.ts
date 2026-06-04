import type { GameParamId } from '@scene-grid/shared';

export type ConditionOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';

export interface IConditionConfig {
    readonly param: GameParamId;
    readonly operator: ConditionOperator;
    readonly value: number;
    readonly hysteresis?: number;
}
