export interface IRTPCAdapter {
    getValue(parameterName: string, defaultValue?: number): number;
    on(parameterName: string, handler: (value: number) => void): void;
    off(parameterName: string, handler: (value: number) => void): void;
}
