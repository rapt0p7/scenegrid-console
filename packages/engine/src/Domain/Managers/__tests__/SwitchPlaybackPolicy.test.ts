/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, beforeEach } from 'vitest';

import SwitchPlaybackPolicy from '@domain/Managers/SwitchPlaybackPolicy.js';

import type { ISwitchSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { GameParamId, SoundId } from '@scene-grid/shared';

describe('SwitchPlaybackPolicy (Pure Evaluator with State)', () => {
    let policy: SwitchPlaybackPolicy;

    beforeEach(() => {
        policy = new SwitchPlaybackPolicy();
    });

    describe('String-based Switches (Enum Mode / Strict Equality "==" & "!=")', () => {
        it('should resolve the correct SoundId and state when currentValue matches a STRING switch key (Equality ==)', () => {
            const config: ISwitchSoundConfig = {
                isSwitch: true,
                switchGroup: 'surface_type' as GameParamId,
                switches: {
                    wood: 'step_wood' as SoundId,
                    stone: 'step_stone' as SoundId
                }
            };

            const result = policy.evaluateNext(config, 'stone');
            expect(result.soundId).toBe('step_stone');
            expect(result.nextState.currentSwitchKey).toBe('stone');
        });

        it('should fallback to defaultSwitch if currentValue does NOT match any key (Inequality !=)', () => {
            const config: ISwitchSoundConfig = {
                isSwitch: true,
                switchGroup: 'surface_type' as GameParamId,
                switches: {
                    wood: 'step_wood' as SoundId
                },
                defaultSwitch: 'step_default' as SoundId
            };

            const result = policy.evaluateNext(config, 'grass');
            expect(result.soundId).toBe('step_default');
            expect(result.nextState.currentSwitchKey).toBe('grass');
        });

        it('should return NULL if currentValue does NOT match (!=) and there is NO defaultSwitch', () => {
            const config: ISwitchSoundConfig = {
                isSwitch: true,
                switchGroup: 'surface_type' as GameParamId,
                switches: {
                    wood: 'step_wood' as SoundId
                }
            };

            const result = policy.evaluateNext(config, 'metal');
            expect(result.soundId).toBeNull();
        });
    });

    describe('Number-based Switches (Threshold Mode)', () => {
        const config: ISwitchSoundConfig = {
            isSwitch: true,
            switchGroup: 'health_level' as GameParamId,
            switches: {
                0: 'heartbeat_fast' as SoundId,
                50: 'heartbeat_medium' as SoundId,
                100: 'heartbeat_slow' as SoundId
            }
        };

        it('should resolve correctly when currentValue is EXACTLY EQUAL (==) to a threshold', () => {
            expect(policy.evaluateNext(config, 0).soundId).toBe('heartbeat_fast');
            expect(policy.evaluateNext(config, 50).soundId).toBe('heartbeat_medium');
            expect(policy.evaluateNext(config, 100).soundId).toBe('heartbeat_slow');
        });

        it('should resolve using nearest smaller threshold when currentValue is NOT EQUAL (!=) to any exact threshold', () => {
            expect(policy.evaluateNext(config, 25).soundId).toBe('heartbeat_fast');
            expect(policy.evaluateNext(config, 150).soundId).toBe('heartbeat_slow');
        });

        it('should fallback to the lowest threshold if currentValue is strictly less than the lowest key', () => {
            expect(policy.evaluateNext(config, -10).soundId).toBe('heartbeat_fast');
        });

        it('should return NULL if switches object is empty and no defaultSwitch is provided', () => {
            const emptyConfig: ISwitchSoundConfig = {
                isSwitch: true,
                switchGroup: 'speed' as GameParamId,
                switches: {}
            };

            const result = policy.evaluateNext(emptyConfig, 50);
            expect(result.soundId).toBeNull();
            expect(result.nextState.currentSwitchKey).toBeNull();
        });
    });

    describe('Hysteresis (Schmitt Trigger Logic)', () => {
        const configWithHysteresis: ISwitchSoundConfig = {
            isSwitch: true,
            switchGroup: 'speed' as GameParamId,
            hysteresis: 10,
            switches: {
                0: 'idle' as SoundId,
                50: 'walk' as SoundId,
                100: 'run' as SoundId
            }
        };

        it('should bypass hysteresis if targetKey IS EQUAL (==) to prevKey (no state change attempted)', () => {
            const currentState = { currentSwitchKey: 50 };

            const result = policy.evaluateNext(configWithHysteresis, 55, currentState);

            expect(result.soundId).toBe('walk');
            expect(result.nextState.currentSwitchKey).toBe(50);
        });

        it('should bypass hysteresis if there is no previous state (first tick)', () => {
            const result = policy.evaluateNext(configWithHysteresis, 105);

            expect(result.soundId).toBe('run');
            expect(result.nextState.currentSwitchKey).toBe(100);
        });

        it('should block transition moving UP if target is NOT EQUAL (!=) to prevKey, but within hysteresis dead zone', () => {
            const currentState = { currentSwitchKey: 50 };

            const result = policy.evaluateNext(configWithHysteresis, 105, currentState);

            expect(result.soundId).toBe('walk');
            expect(result.nextState.currentSwitchKey).toBe(50);
        });

        it('should allow transition moving UP if target exceeds hysteresis dead zone', () => {
            const currentState = { currentSwitchKey: 50 };

            const result = policy.evaluateNext(configWithHysteresis, 110, currentState);

            expect(result.soundId).toBe('run');
            expect(result.nextState.currentSwitchKey).toBe(100);
        });

        it('should block transition moving DOWN if target is NOT EQUAL (!=) to prevKey, but within hysteresis dead zone', () => {
            const currentState = { currentSwitchKey: 100 };

            const result = policy.evaluateNext(configWithHysteresis, 95, currentState);

            expect(result.soundId).toBe('run');
            expect(result.nextState.currentSwitchKey).toBe(100);
        });

        it('should allow transition moving DOWN if target exceeds hysteresis dead zone', () => {
            const currentState = { currentSwitchKey: 100 };

            const result = policy.evaluateNext(configWithHysteresis, 89, currentState);

            expect(result.soundId).toBe('walk');
            expect(result.nextState.currentSwitchKey).toBe(50);
        });
    });
});
