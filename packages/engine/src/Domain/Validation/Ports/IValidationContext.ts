// oxlint-disable typescript/no-unnecessary-type-parameters

import type {
    AnySoundConfig,
    IContainerSoundConfig,
    ILayeredSoundConfig,
    IScattererSoundConfig,
    ISmartLoopSoundConfig,
    ISwitchSoundConfig
} from '@domain/Configuration/Ports/ISoundConfig.js';
import { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload.js';

export type TypeMap = {
    string: string;
    number: number;
    boolean: boolean;
    object: Record<string, unknown>;
    function: Function;
};

export interface IValidationContext {
    readonly config: Required<IConsistencyCheckerPayload>;
    addError(message: string): void;
    addWarning(message: string): void;
    assertRequiredType<K extends keyof TypeMap>(path: string, value: unknown, expectedType: K): boolean;
    assertOptionalType<K extends keyof TypeMap>(path: string, value: unknown, expectedType: K): boolean;
    assertArray(path: string, value: unknown, isOptional?: boolean): boolean;
    validateTuple(path: string, tuple: unknown): void;
    isScatterer(cfg: AnySoundConfig): cfg is IScattererSoundConfig;
    isLayered(cfg: AnySoundConfig): cfg is ILayeredSoundConfig;
    isContainer(cfg: AnySoundConfig): cfg is IContainerSoundConfig;
    isSmartLoop(cfg: AnySoundConfig): cfg is ISmartLoopSoundConfig;
    isSwitch(cfg: any): cfg is ISwitchSoundConfig;
    checkTargetExists(eventId: string, path: string, targetId: string): void;
    getIsConsistent(): boolean;
    getErrors(): string[];
    getWarnings(): string[];
    report(): void;
}
