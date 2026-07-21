// oxlint-disable typescript/no-unnecessary-type-parameters
import type { IValidationContext, TypeMap } from '@domain/Validation/Ports/IValidationContext.js';
import { type DeepReadonly, type IConsistencyReportData, isAbsent } from '@scene-grid/shared';
import type { IConsistencyReporter } from '@domain/Validation/Ports/IConsistencyReporter.js';
import type {
    AnySoundConfig,
    IContainerSoundConfig,
    ILayeredSoundConfig,
    IScattererSoundConfig,
    ISmartLoopSoundConfig,
    ISwitchSoundConfig
} from '@domain/Configuration/Ports/ISoundConfig.js';
import type { IMusicFSMConfig } from '@domain/Configuration/Ports/IMusicFSMConfig.js';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import { ConsoleReporter } from '@domain/Validation/Reporters/ConsoleReporter.js';
import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload.js';
import type { IConsistencyCheckerOptions } from '@domain/Validation/Ports/IConsistencyCheckerOptions.js';

export default class ValidationContext implements IValidationContext {
    public config: DeepReadonly<Required<IConsistencyCheckerPayload>>;
    private readonly reporters: IConsistencyReporter[];
    private readonly errors: string[] = [];
    private readonly warnings: string[] = [];

    constructor(config: DeepReadonly<IConsistencyCheckerPayload>, options?: IConsistencyCheckerOptions) {
        this.config = {
            soundMap: config.soundMap ?? ({} as ISoundMap),
            manifest: config.manifest ?? {},
            buses: config.buses ?? {},
            snapshots: config.snapshots ?? {},
            rtpcManifest: config.rtpcManifest ?? {},
            events: config.events ?? {},
            banks: config.banks ?? {},
            musicFSM: config.musicFSM ?? ({} as IMusicFSMConfig)
        };

        this.reporters = options?.reporters ?? [new ConsoleReporter()];
    }

    public addError(message: string): void {
        this.errors.push(message);
    }

    public addWarning(message: string): void {
        this.warnings.push(message);
    }

    public assertRequiredType<K extends keyof TypeMap>(path: string, value: unknown, expectedType: K): boolean {
        if (isAbsent(value)) {
            this.addError(`Missing required field at "${path}"`);
            return false;
        }

        if (typeof value !== expectedType) {
            this.addError(`Type Error at "${path}": expected ${expectedType}, got ${typeof value}`);
            return false;
        }

        if (expectedType === 'object' && Array.isArray(value)) {
            this.addError(`Type Error at "${path}": expected object, got array`);
            return false;
        }

        return true;
    }

    public assertOptionalType<K extends keyof TypeMap>(path: string, value: unknown, expectedType: K): boolean {
        if (isAbsent(value)) {
            return true;
        }

        return this.assertRequiredType(path, value, expectedType);
    }

    public assertArray(path: string, value: unknown, isOptional?: boolean): boolean {
        if (isAbsent(value)) {
            if (!isOptional) {
                this.addError(`Missing required array at "${path}"`);
                return false;
            }
            return true;
        }

        if (!Array.isArray(value)) {
            this.addError(`Type Error at "${path}": expected array, got ${typeof value}`);
            return false;
        }
        return true;
    }

    public validateTuple(path: string, tuple: unknown): void {
        if (!this.assertArray(path, tuple, false)) return;

        const arr = tuple as readonly unknown[];
        if (arr.length !== 2) {
            this.errors.push(`Field "${path}" must be a tuple of exactly two numbers [min, max].`);
            return;
        }

        const min = arr[0];
        const max = arr[1];

        if (typeof min !== 'number' || typeof max !== 'number') {
            this.errors.push(`Elements in tuple "${path}" must be numbers.`);
        } else if (min > max) {
            this.errors.push(`Invalid tuple at "${path}": min (${min}) cannot be greater than max (${max}).`);
        }
    }

    public checkTargetExists(eventId: string, path: string, targetId: string): void {
        if (!this.config.manifest[targetId as any] && !this.config.soundMap[targetId as any]) {
            this.addWarning(`Event "${eventId}" references missing sound target "${targetId}" at ${path}.`);
        }
    }

    public isScatterer(cfg: AnySoundConfig): cfg is IScattererSoundConfig {
        return typeof cfg === 'object' && cfg !== null && 'isScatterer' in cfg && cfg.isScatterer;
    }

    public isLayered(cfg: AnySoundConfig): cfg is ILayeredSoundConfig {
        return typeof cfg === 'object' && cfg !== null && 'isLayered' in cfg && cfg.isLayered;
    }

    public isContainer(cfg: AnySoundConfig): cfg is IContainerSoundConfig {
        return typeof cfg === 'object' && cfg !== null && 'isContainer' in cfg && cfg.isContainer;
    }

    public isSmartLoop(cfg: AnySoundConfig): cfg is ISmartLoopSoundConfig {
        return typeof cfg === 'object' && cfg !== null && 'smartLoop' in cfg;
    }

    public isSwitch(cfg: any): cfg is ISwitchSoundConfig {
        return cfg && typeof cfg === 'object' && 'isSwitch' in cfg && cfg.isSwitch === true;
    }

    public getIsConsistent(): boolean {
        return this.errors.length === 0;
    }

    public getErrors(): string[] {
        return this.errors;
    }

    public getWarnings(): string[] {
        return this.warnings;
    }

    public report(): void {
        const data: IConsistencyReportData = {
            errors: [...this.errors],
            warnings: [...this.warnings],
            isConsistent: this.getIsConsistent()
        };

        for (const reporter of this.reporters) {
            reporter.report(data);
        }
    }
}
