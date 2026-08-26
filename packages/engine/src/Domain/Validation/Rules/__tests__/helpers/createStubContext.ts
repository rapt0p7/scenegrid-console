// oxlint-disable typescript/no-unnecessary-type-parameters
// noinspection D

import type {
    AnySoundConfig,
    IContainerSoundConfig,
    ILayeredSoundConfig,
    IScattererSoundConfig,
    ISmartLoopSoundConfig,
    ISwitchSoundConfig
} from '@domain/Configuration/Ports/ISoundConfig.js';
import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload.js';
import type { IValidationContext, TypeMap } from '@domain/Validation/Ports/IValidationContext.js';

export function createStubContext(payload: Partial<IConsistencyCheckerPayload>): IValidationContext {
    const errors: string[] = [];
    const warnings: string[] = [];

    const config = {
        banks: payload.banks ?? {},
        soundMap: payload.soundMap ?? {},
        manifest: payload.manifest ?? {},
        buses: payload.buses ?? {},
        snapshots: payload.snapshots ?? {},
        rtpcManifest: payload.rtpcManifest ?? {},
        events: 'events' in payload ? (payload.events ?? {}) : {},
        musicFSM: payload.musicFSM ?? ({} as any),
        ramQuotaMb: Number.MAX_SAFE_INTEGER,
        precalculatedSizes: payload.precalculatedSizes ?? {}
    };

    return {
        config,
        addError: (msg: string) => errors.push(msg),
        addWarning: (msg: string) => warnings.push(msg),
        assertRequiredType: <K extends keyof TypeMap>(path: string, val: unknown, type: K) => {
            if (val === null || val === undefined) {
                errors.push(`Missing required field at "${path}"`);
                return false;
            }
            if (typeof val !== type) {
                errors.push(`Type Error at "${path}": expected ${type}, got ${typeof val}`);
                return false;
            }
            return true;
        },
        assertOptionalType: <K extends keyof TypeMap>(path: string, val: unknown, type: K) => {
            if (val === null || val === undefined) return true;
            if (typeof val !== type) {
                errors.push(`Type Error at "${path}": expected ${type}, got ${typeof val}`);
                return false;
            }
            return true;
        },
        assertArray: (path: string, val: unknown, isOptional?: boolean) => {
            if (val === null || val === undefined) {
                if (!isOptional) {
                    errors.push(`Missing required array at "${path}"`);
                    return false;
                }
                return true;
            }
            if (!Array.isArray(val)) {
                errors.push(`Type Error at "${path}": expected array, got ${typeof val}`);
                return false;
            }
            return true;
        },
        validateTuple: () => {},
        isScatterer: (cfg: AnySoundConfig): cfg is IScattererSoundConfig =>
            cfg && typeof cfg === 'object' && 'isScatterer' in cfg && cfg.isScatterer,
        isLayered: (cfg: AnySoundConfig): cfg is ILayeredSoundConfig =>
            cfg && typeof cfg === 'object' && 'isLayered' in cfg && cfg.isLayered,
        isContainer: (cfg: AnySoundConfig): cfg is IContainerSoundConfig =>
            cfg && typeof cfg === 'object' && 'isContainer' in cfg && cfg.isContainer,
        isSmartLoop: (cfg: AnySoundConfig): cfg is ISmartLoopSoundConfig =>
            cfg && typeof cfg === 'object' && 'smartLoop' in cfg,
        isSwitch: (cfg: any): cfg is ISwitchSoundConfig =>
            Boolean(cfg && typeof cfg === 'object' && cfg.isSwitch === true),
        checkTargetExists: () => {},
        getIsConsistent: () => errors.length === 0,
        getErrors: () => errors,
        getWarnings: () => warnings,
        report: () => {}
    };
}
