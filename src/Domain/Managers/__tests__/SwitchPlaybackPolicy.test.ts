/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, beforeEach } from 'vitest';

import SwitchPlaybackPolicy from '@domain/Managers/SwitchPlaybackPolicy.js';

import type { ISwitchSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { GameParamId, SoundId } from '@shared/Types/Branded.js';

describe('SwitchPlaybackPolicy (Pure Evaluator)', () => {
    let policy: SwitchPlaybackPolicy;

    beforeEach(() => {
        policy = new SwitchPlaybackPolicy();
    });

    it('should resolve the correct SoundId when currentValue matches a STRING switch key', () => {
        const config: ISwitchSoundConfig = {
            isSwitch: true,
            switchGroup: 'surface_type' as GameParamId,
            switches: {
                wood: 'step_wood' as SoundId,
                stone: 'step_stone' as SoundId
            }
        };

        const result = policy.evaluate(config, 'stone');
        expect(result).toBe('step_stone');
    });

    it('should resolve the correct SoundId when currentValue matches a NUMBER switch key', () => {
        const config: ISwitchSoundConfig = {
            isSwitch: true,
            switchGroup: 'health_level' as GameParamId,
            switches: {
                0: 'heartbeat_fast' as SoundId,
                1: 'heartbeat_slow' as SoundId
            }
        };

        const result = policy.evaluate(config, 0);
        expect(result).toBe('heartbeat_fast');
    });

    it('should fallback to defaultSwitch if currentValue does NOT match any key', () => {
        const config: ISwitchSoundConfig = {
            isSwitch: true,
            switchGroup: 'surface_type' as GameParamId,
            switches: {
                wood: 'step_wood' as SoundId
            },
            defaultSwitch: 'step_default' as SoundId
        };

        const result = policy.evaluate(config, 'grass');
        expect(result).toBe('step_default');
    });

    it('should fallback to defaultSwitch if currentValue is UNDEFINED', () => {
        const config: ISwitchSoundConfig = {
            isSwitch: true,
            switchGroup: 'surface_type' as GameParamId,
            switches: {
                wood: 'step_wood' as SoundId
            },
            defaultSwitch: 'step_default' as SoundId
        };

        // oxlint-disable-next-line unicorn/no-useless-undefined
        const result = policy.evaluate(config, undefined);
        expect(result).toBe('step_default');
    });

    it('should return NULL if currentValue does NOT match and there is NO defaultSwitch', () => {
        const config: ISwitchSoundConfig = {
            isSwitch: true,
            switchGroup: 'surface_type' as GameParamId,
            switches: {
                wood: 'step_wood' as SoundId
            }
        };

        const result = policy.evaluate(config, 'metal');
        expect(result).toBeNull();
    });

    it('should return NULL if the switches object is empty and there is NO defaultSwitch', () => {
        const config: ISwitchSoundConfig = {
            isSwitch: true,
            switchGroup: 'surface_type' as GameParamId,
            switches: {}
        };

        const result = policy.evaluate(config, 'wood');
        expect(result).toBeNull();
    });

    it('should correctly cast numerical string values to match integer keys (Loose equality fallback)', () => {
        const config: ISwitchSoundConfig = {
            isSwitch: true,
            switchGroup: 'impact_force' as GameParamId,
            switches: {
                100: 'heavy_impact' as SoundId
            }
        };

        const result = policy.evaluate(config, 100);
        expect(result).toBe('heavy_impact');
    });
});
