/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import type { ISwitchSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { GameParamId, SoundId } from '@scene-grid/shared';

import SwitchPlaybackPolicy from '@domain/Managers/SwitchPlaybackPolicy.js';
import { it, fc } from '@fast-check/vitest';
import { describe, expect, beforeEach } from 'vitest';

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

    describe('Number-based Switches (Threshold Mode - Sorting & Filtering)', () => {
        it('should sort thresholds numerically regardless of property insertion order with decimal keys', () => {
            const config: ISwitchSoundConfig = {
                isSwitch: true,
                switchGroup: 'speed' as GameParamId,
                switches: {
                    '10.5': 'run' as SoundId,
                    '0.5': 'idle' as SoundId,
                    '5.5': 'walk' as SoundId
                }
            };

            const resultMid = policy.evaluateNext(config, 6.0);
            expect(resultMid.soundId).toBe('walk');
            expect(resultMid.nextState.currentSwitchKey).toBe(5.5);

            const resultLow = policy.evaluateNext(config, 0.2);
            expect(resultLow.soundId).toBe('idle');
            expect(resultLow.nextState.currentSwitchKey).toBe(0.5);
        });

        it('should filter out non-numeric keys from numeric threshold evaluation', () => {
            const config: ISwitchSoundConfig = {
                isSwitch: true,
                switchGroup: 'speed' as GameParamId,
                switches: {
                    invalid_key: 'error_sound' as SoundId,
                    0: 'idle' as SoundId,
                    50: 'walk' as SoundId
                }
            };

            const result = policy.evaluateNext(config, 25);

            expect(result.soundId).toBe('idle');
            expect(result.nextState.currentSwitchKey).toBe(0);
        });
    });

    it('should not apply hysteresis or retain previous switch key when switches map is empty', () => {
        const configWithHysteresis: ISwitchSoundConfig = {
            isSwitch: true,
            switchGroup: 'speed' as GameParamId,
            hysteresis: 10,
            switches: {}
        };
        const currentState = { currentSwitchKey: 50 };

        const result = policy.evaluateNext(configWithHysteresis, 45, currentState);

        expect(result.soundId).toBeNull();
        expect(result.nextState.currentSwitchKey).toBeNull();
    });

    it('should return defaultSwitch when switches map is empty and currentValue is a number', () => {
        const configWithDefault: ISwitchSoundConfig = {
            isSwitch: true,
            switchGroup: 'speed' as GameParamId,
            switches: {},
            defaultSwitch: 'step_default' as SoundId
        };

        const result = policy.evaluateNext(configWithDefault, 50);

        expect(result.soundId).toBe('step_default');
        expect(result.nextState.currentSwitchKey).toBeNull();
    });

    describe('Hysteresis Edge Cases', () => {
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

        it('should ignore hysteresis if currentState has non-numeric currentSwitchKey', () => {
            const currentState = { currentSwitchKey: 'wood' as unknown as number };

            const result = policy.evaluateNext(configWithHysteresis, 55, currentState);

            expect(result.soundId).toBe('walk');
            expect(result.nextState.currentSwitchKey).toBe(50);
        });

        it('should allow upward transition exactly at the hysteresis boundary (targetKey + hysteresis)', () => {
            const currentState = { currentSwitchKey: 50 };

            const result = policy.evaluateNext(configWithHysteresis, 110, currentState);

            expect(result.soundId).toBe('run');
            expect(result.nextState.currentSwitchKey).toBe(100);
        });

        it('should allow downward transition exactly at the hysteresis boundary (prevKey - hysteresis)', () => {
            const currentState = { currentSwitchKey: 100 };

            const result = policy.evaluateNext(configWithHysteresis, 90, currentState);

            expect(result.soundId).toBe('walk');
            expect(result.nextState.currentSwitchKey).toBe(50);
        });
    });

    describe('SwitchPlaybackPolicy Invariants (Property-Based)', () => {
        it.prop([
            fc.uniqueArray(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 10 }),
            fc.integer({ min: -1500, max: 1500 })
        ])(
            'should always pick the greatest threshold less than or equal to currentValue regardless of key order',
            (thresholds, val) => {
                // oxlint-disable-next-line unicorn/no-array-sort
                const sorted = [...thresholds].sort((a, b) => a - b);
                const switches: Record<number, SoundId> = {};
                for (const t of thresholds) {
                    switches[t] = `sound_${t}` as SoundId;
                }
                const config: ISwitchSoundConfig = {
                    isSwitch: true,
                    switchGroup: 'param' as GameParamId,
                    switches
                };

                const result = policy.evaluateNext(config, val);

                const expectedKey =
                    val < sorted[0]
                        ? sorted[0]
                        : // oxlint-disable-next-line unicorn/prefer-array-find
                          sorted.filter(k => val >= k).pop()!;

                expect(result.nextState.currentSwitchKey).toBe(expectedKey);
                expect(result.soundId).toBe(`sound_${expectedKey}`);
            }
        );
    });
});
