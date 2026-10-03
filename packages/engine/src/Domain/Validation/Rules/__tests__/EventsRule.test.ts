import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

import { describe, expect, it, vi } from 'vitest';

import EventsRule from '../EventsRule.js';
import { createStubContext } from './helpers/createStubContext';

describe('EventsRule', () => {
    describe('validate', () => {
        it('should cleanly return when events configuration is absent (Line 11)', () => {
            const rule = new EventsRule();
            const context = createStubContext({ events: undefined });

            rule.validate(context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should validate delay and probability bounds correctly (Lines 37 & 45)', () => {
            const rule = new EventsRule();
            const context = createStubContext({
                manifest: { sfx_1: {} as any },
                events: {
                    evt_1: {
                        actions: [
                            { type: 'play', target: 'sfx_1', delay: 0, probability: 0.0 },
                            { type: 'play', target: 'sfx_1', delay: 100, probability: 1.0 },
                            { type: 'play', target: 'sfx_1', delay: -1, probability: 1.5 }
                        ]
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain('Action at "events.evt_1.actions[2].delay" cannot be negative.');
            expect(context.getErrors()).toContain(
                'Action at "events.evt_1.actions[2].probability" must be between 0.0 and 1.0.'
            );
        });

        it('should validate action tags array (Lines 51-55)', () => {
            const rule = new EventsRule();
            const context = createStubContext({
                manifest: { sfx_1: {} as any },
                events: {
                    evt_1: {
                        actions: [{ type: 'play', target: 'sfx_1', tags: ['good_tag', 123 as any] }]
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain(
                'Type Error at "events.evt_1.actions[0].tags[1]": expected string, got number'
            );
        });

        it('should validate RTPC condition operators and zero hysteresis (Lines 80 & 90)', () => {
            const rule = new EventsRule();
            const context = createStubContext({
                manifest: { sfx_1: {} as any },
                rtpcManifest: { param1: {} as any },
                events: {
                    evt_1: {
                        actions: [
                            {
                                type: 'play',
                                target: 'sfx_1',
                                condition: { param: 'param1', operator: '==', value: 10, hysteresis: 0 }
                            },
                            {
                                type: 'play',
                                target: 'sfx_1',
                                condition: { param: 'param1', operator: 'invalid_op', value: 10, hysteresis: -0.1 }
                            }
                        ]
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain(
                'Invalid operator "invalid_op" at events.evt_1.actions[1].condition.operator.'
            );
            expect(context.getErrors()).toContain(
                'Action at "events.evt_1.actions[1].condition.hysteresis" cannot be negative.'
            );
        });

        it('should validate music transition and stinger enums (Lines 193 & 212)', () => {
            const rule = new EventsRule();
            const context = createStubContext({
                soundMap: { bgm: {} as any },
                manifest: { stinger: {} as any },
                events: {
                    evt_1: {
                        actions: [
                            {
                                type: 'music_transition',
                                target: 'bgm',
                                targetRegion: 'reg_1',
                                options: { offsetMode: 'BadMode' }
                            },
                            {
                                type: 'play_stinger',
                                target: 'stinger',
                                quantize: 'BadQuantize' as any
                            }
                        ]
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain(
                `Action at "events.evt_1.actions[0].options.offsetMode" has invalid value "BadMode". Expected 'None', 'Relative', or 'Inverted'.`
            );
            expect(context.getErrors()).toContain(
                `Action at "events.evt_1.actions[1].quantize" has invalid value "BadQuantize". Expected 'Immediate', 'NextBeat', or 'NextBar'.`
            );
        });

        it('should detect self-referencing event recursion and missing bank targets (Lines 254 & 264)', () => {
            const rule = new EventsRule();
            const context = createStubContext({
                banks: {},
                events: {
                    evt_self: {
                        actions: [
                            { type: 'trigger_event', target: 'evt_self' },
                            { type: 'load_bank', target: 'missing_bank' }
                        ]
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain('Event "evt_self" references itself in action list.');
            expect(context.getErrors()).toContain(
                'Event "evt_self" references missing bank "missing_bank" at events.evt_self.actions[1].'
            );
        });

        it('should validate cancel_pending targetTags requirements (Lines 274-282)', () => {
            const rule = new EventsRule();
            const context = createStubContext({
                events: {
                    evt_1: {
                        actions: [
                            { type: 'cancel_pending' },
                            { type: 'cancel_pending', targetTags: ['tag_a', 'tag_b'] }
                        ]
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain(
                'Action at "events.evt_1.actions[0]" is missing required property "targetTags".'
            );
        });

        it('should exit immediately when events config is absent without asserting schema (Line 11)', () => {
            const rule = new EventsRule();
            const assertOptionalTypeSpy = vi.fn();
            const context = createStubContext({});

            // @ts-expect-error Rewriting for test
            context.config.events = undefined as any;
            context.assertOptionalType = assertOptionalTypeSpy;

            rule.validate(context);

            expect(assertOptionalTypeSpy).not.toHaveBeenCalled();
            expect(context.getErrors()).toHaveLength(0);
        });

        describe('delay and probability boundary validation', () => {
            it('should accept valid boundary values (delay: 0, probability: 0.0 and 1.0) (Lines 37 & 45)', () => {
                const rule = new EventsRule();
                const context = createStubContext({
                    manifest: { sfx_click: {} as any },
                    events: {
                        evt_bounds: {
                            actions: [
                                { type: 'play', target: 'sfx_click', delay: 0, probability: 0.0 },
                                { type: 'play', target: 'sfx_click', delay: 100, probability: 1.0 }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getErrors()).toHaveLength(0);
            });

            it('should reject negative delays and out-of-range probabilities (Lines 37 & 45)', () => {
                const rule = new EventsRule();
                const context = createStubContext({
                    manifest: { sfx_click: {} as any },
                    events: {
                        evt_invalid: {
                            actions: [
                                { type: 'play', target: 'sfx_click', delay: -1 },
                                { type: 'play', target: 'sfx_click', probability: -0.01 },
                                { type: 'play', target: 'sfx_click', probability: 1.01 }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getErrors()).toContain(
                    'Action at "events.evt_invalid.actions[0].delay" cannot be negative.'
                );
                expect(context.getErrors()).toContain(
                    'Action at "events.evt_invalid.actions[1].probability" must be between 0.0 and 1.0.'
                );
                expect(context.getErrors()).toContain(
                    'Action at "events.evt_invalid.actions[2].probability" must be between 0.0 and 1.0.'
                );
            });
        });

        it('should validate each tag item as a string and not iterate out-of-bounds (Lines 52 & 54)', () => {
            const rule = new EventsRule();
            const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);
            const context = createStubContext({
                manifest: { sfx_jump: {} as any },
                events: {
                    evt_tags: {
                        actions: [{ type: 'play', target: 'sfx_jump', tags: ['movement', 'combat'] }]
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            context.assertRequiredType = assertRequiredTypeSpy;

            rule.validate(context);

            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'events.evt_tags.actions[0].tags[0]',
                'movement',
                'string'
            );
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'events.evt_tags.actions[0].tags[1]',
                'combat',
                'string'
            );
            expect(assertRequiredTypeSpy).not.toHaveBeenCalledWith(
                'events.evt_tags.actions[0].tags[2]',
                expect.anything(),
                expect.anything()
            );
        });

        describe('rtpc conditions and operators', () => {
            it('should accept all 6 operators and zero hysteresis without errors (Lines 80 & 90)', () => {
                const rule = new EventsRule();
                const operators = ['==', '!=', '>', '>=', '<', '<='] as const;
                const context = createStubContext({
                    manifest: { sfx_hum: {} as any },
                    rtpcManifest: { speed: {} as any },
                    events: {
                        evt_ops: {
                            actions: operators.map(op => ({
                                type: 'play',
                                target: 'sfx_hum',
                                condition: { param: 'speed', operator: op, value: 50, hysteresis: 0 }
                            }))
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getErrors()).toHaveLength(0);
            });

            it('should not error on param when rtpcManifest is empty, but error when manifest is populated and param is missing (Lines 68-69)', () => {
                const rule = new EventsRule();
                const contextEmptyManifest = createStubContext({
                    manifest: { sfx_hum: {} as any },
                    rtpcManifest: {},
                    events: {
                        evt_1: {
                            actions: [
                                {
                                    type: 'play',
                                    target: 'sfx_hum',
                                    condition: { param: 'any_param', operator: '==', value: 1 }
                                }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                const contextPopulatedManifest = createStubContext({
                    manifest: { sfx_hum: {} as any },
                    rtpcManifest: { known_param: {} as any },
                    events: {
                        evt_2: {
                            actions: [
                                {
                                    type: 'play',
                                    target: 'sfx_hum',
                                    condition: { param: 'unknown_param', operator: '==', value: 1 }
                                }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(contextEmptyManifest);
                rule.validate(contextPopulatedManifest);

                expect(contextEmptyManifest.getErrors()).toHaveLength(0);
                expect(contextPopulatedManifest.getErrors()).toContain(
                    'Event "evt_2" uses unknown RTPC param "unknown_param" in condition at events.evt_2.actions[0].condition.'
                );
            });
        });

        describe('pause, resume, and stop action options', () => {
            it('should validate target sound existence for both pause and resume actions (Line 103)', () => {
                const rule = new EventsRule();
                const checkTargetExistsSpy = vi.fn();
                const context = createStubContext({
                    events: {
                        evt_control: {
                            actions: [
                                { type: 'pause', target: 'bgm_track' },
                                { type: 'resume', target: 'bgm_track' }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.checkTargetExists = checkTargetExistsSpy;

                rule.validate(context);

                expect(checkTargetExistsSpy).toHaveBeenCalledWith(
                    'evt_control',
                    'events.evt_control.actions[0]',
                    'bgm_track'
                );
                expect(checkTargetExistsSpy).toHaveBeenCalledWith(
                    'evt_control',
                    'events.evt_control.actions[1]',
                    'bgm_track'
                );
            });

            it('should not validate options when omitted on stop action (Line 118)', () => {
                const rule = new EventsRule();
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);
                const context = createStubContext({
                    manifest: { sfx_loop: {} as any },
                    events: {
                        evt_stop: {
                            actions: [{ type: 'stop', target: 'sfx_loop' }]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertRequiredType = assertRequiredTypeSpy;

                rule.validate(context);

                expect(assertRequiredTypeSpy).not.toHaveBeenCalledWith(
                    'events.evt_stop.actions[0].options',
                    expect.anything(),
                    expect.anything()
                );
            });
        });

        describe('music transition and stinger enum values', () => {
            it('should accept valid offsetMode and quantize enum values (Lines 193 & 212)', () => {
                const rule = new EventsRule();
                const context = createStubContext({
                    soundMap: { bgm_loop: {} as any },
                    manifest: { sfx_stinger: {} as any },
                    events: {
                        evt_music: {
                            actions: [
                                {
                                    type: 'music_transition',
                                    target: 'bgm_loop',
                                    targetRegion: 'r1',
                                    options: { offsetMode: 'None' }
                                },
                                {
                                    type: 'music_transition',
                                    target: 'bgm_loop',
                                    targetRegion: 'r1',
                                    options: { offsetMode: 'Relative' }
                                },
                                {
                                    type: 'music_transition',
                                    target: 'bgm_loop',
                                    targetRegion: 'r1',
                                    options: { offsetMode: 'Inverted' }
                                },
                                { type: 'play_stinger', target: 'sfx_stinger', quantize: 'Immediate' },
                                { type: 'play_stinger', target: 'sfx_stinger', quantize: 'NextBeat' },
                                { type: 'play_stinger', target: 'sfx_stinger', quantize: 'NextBar' }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getErrors()).toHaveLength(0);
            });

            it('should reject invalid offsetMode and quantize values with exact error messages (Lines 193 & 212)', () => {
                const rule = new EventsRule();
                const context = createStubContext({
                    soundMap: { bgm_loop: {} as any },
                    manifest: { sfx_stinger: {} as any },
                    events: {
                        evt_bad_enums: {
                            actions: [
                                {
                                    type: 'music_transition',
                                    target: 'bgm_loop',
                                    targetRegion: 'r1',
                                    options: { offsetMode: 'InvalidMode' }
                                },
                                { type: 'play_stinger', target: 'sfx_stinger', quantize: 'InvalidQuantize' as any }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getErrors()).toContain(
                    `Action at "events.evt_bad_enums.actions[0].options.offsetMode" has invalid value "InvalidMode". Expected 'None', 'Relative', or 'Inverted'.`
                );
                expect(context.getErrors()).toContain(
                    `Action at "events.evt_bad_enums.actions[1].quantize" has invalid value "InvalidQuantize". Expected 'Immediate', 'NextBeat', or 'NextBar'.`
                );
            });
        });

        describe('modifiers, bank actions, and self-referencing event recursion', () => {
            it('should assert modifier schema paths and detect self-referencing event recursion (Lines 237, 243, 254)', () => {
                const rule = new EventsRule();
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);
                const context = createStubContext({
                    events: {
                        evt_loop: {
                            actions: [
                                {
                                    type: 'add_mixer_modifier',
                                    snapshotName: 'low_health',
                                    modifierId: 'mod_1',
                                    priority: 1
                                },
                                { type: 'remove_mixer_modifier', modifierId: 'mod_1' },
                                { type: 'trigger_event', target: 'evt_loop' }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertRequiredType = assertRequiredTypeSpy;

                rule.validate(context);

                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_loop.actions[0].modifierId',
                    'mod_1',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_loop.actions[1].modifierId',
                    'mod_1',
                    'string'
                );
                expect(context.getErrors()).toContain('Event "evt_loop" references itself in action list.');
            });
        });

        describe('cancel_pending action validation', () => {
            it('should enforce required targetTags and validate each element without out-of-bounds iteration (Lines 276-281)', () => {
                const rule = new EventsRule();
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);
                const context = createStubContext({
                    events: {
                        evt_cancel: {
                            actions: [
                                { type: 'cancel_pending' },
                                { type: 'cancel_pending', targetTags: ['bgm_fade', 'vo_duck'] }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertRequiredType = assertRequiredTypeSpy;

                rule.validate(context);

                expect(context.getErrors()).toContain(
                    'Action at "events.evt_cancel.actions[0]" is missing required property "targetTags".'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_cancel.actions[1].targetTags[0]',
                    'bgm_fade',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_cancel.actions[1].targetTags[1]',
                    'vo_duck',
                    'string'
                );
                expect(assertRequiredTypeSpy).not.toHaveBeenCalledWith(
                    'events.evt_cancel.actions[1].targetTags[2]',
                    expect.anything(),
                    expect.anything()
                );
            });
        });

        describe('delay and probability schema assertions and guards', () => {
            it('should not call assertOptionalType for delay and probability when they are omitted (Lines 35 & 43)', () => {
                const rule = new EventsRule();
                const assertOptionalTypeSpy = vi.fn().mockReturnValue(true);
                const context = createStubContext({
                    manifest: { sfx_sound: {} as any },
                    events: {
                        evt_minimal: {
                            actions: [{ type: 'play', target: 'sfx_sound' }]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertOptionalType = assertOptionalTypeSpy;

                rule.validate(context);

                expect(assertOptionalTypeSpy).not.toHaveBeenCalledWith(
                    'events.evt_minimal.actions[0].delay',
                    expect.anything(),
                    expect.anything()
                );
                expect(assertOptionalTypeSpy).not.toHaveBeenCalledWith(
                    'events.evt_minimal.actions[0].probability',
                    expect.anything(),
                    expect.anything()
                );
            });

            it('should assert exact schema paths for delay and probability when defined (Lines 36 & 44)', () => {
                const rule = new EventsRule();
                const assertOptionalTypeSpy = vi.fn().mockReturnValue(true);
                const context = createStubContext({
                    manifest: { sfx_sound: {} as any },
                    events: {
                        evt_explicit: {
                            actions: [{ type: 'play', target: 'sfx_sound', delay: 150, probability: 0.75 }]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertOptionalType = assertOptionalTypeSpy;

                rule.validate(context);

                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_explicit.actions[0].delay',
                    150,
                    'number'
                );
                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_explicit.actions[0].probability',
                    0.75,
                    'number'
                );
            });
        });

        describe('action tags schema assertions and bounds', () => {
            it('should assert required non-optional array for tags and iterate exact element count (Lines 52 & 54)', () => {
                const rule = new EventsRule();
                const assertArraySpy = vi.fn().mockReturnValue(true);
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);

                const tags = ['ui_sound', 'high_priority'];
                const context = createStubContext({
                    manifest: { sfx_sound: {} as any },
                    events: {
                        evt_tags: {
                            actions: [{ type: 'play', target: 'sfx_sound', tags }]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertArray = assertArraySpy;
                context.assertRequiredType = assertRequiredTypeSpy;

                rule.validate(context);

                expect(assertArraySpy).toHaveBeenCalledWith('events.evt_tags.actions[0].tags', tags, false);
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_tags.actions[0].tags[0]',
                    'ui_sound',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_tags.actions[0].tags[1]',
                    'high_priority',
                    'string'
                );
                expect(assertRequiredTypeSpy).not.toHaveBeenCalledWith(
                    'events.evt_tags.actions[0].tags[2]',
                    expect.anything(),
                    expect.anything()
                );
            });
        });

        describe('condition schema paths and hysteresis guard', () => {
            it('should assert exact schema paths for condition, param, and operator (Lines 61, 66, 79)', () => {
                const rule = new EventsRule();
                const assertOptionalTypeSpy = vi.fn().mockReturnValue(true);
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);

                const conditionObj = { param: 'intensity', operator: '>', value: 50 };
                const context = createStubContext({
                    manifest: { sfx_sound: {} as any },
                    rtpcManifest: { intensity: {} as any },
                    events: {
                        evt_cond: {
                            actions: [{ type: 'play', target: 'sfx_sound', condition: conditionObj }]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertOptionalType = assertOptionalTypeSpy;
                context.assertRequiredType = assertRequiredTypeSpy;

                rule.validate(context);

                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_cond.actions[0].condition',
                    conditionObj,
                    'object'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_cond.actions[0].condition.param',
                    'intensity',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_cond.actions[0].condition.operator',
                    '>',
                    'string'
                );

                expect(assertOptionalTypeSpy).not.toHaveBeenCalledWith(
                    'events.evt_cond.actions[0].condition.hysteresis',
                    expect.anything(),
                    expect.anything()
                );
            });

            it('should assert exact schema path for hysteresis when defined (Lines 88 & 89)', () => {
                const rule = new EventsRule();
                const assertOptionalTypeSpy = vi.fn().mockReturnValue(true);
                const context = createStubContext({
                    manifest: { sfx_sound: {} as any },
                    rtpcManifest: { intensity: {} as any },
                    events: {
                        evt_hys: {
                            actions: [
                                {
                                    type: 'play',
                                    target: 'sfx_sound',
                                    condition: { param: 'intensity', operator: '>=', value: 10, hysteresis: 2.5 }
                                }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertOptionalType = assertOptionalTypeSpy;

                rule.validate(context);

                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_hys.actions[0].condition.hysteresis',
                    2.5,
                    'number'
                );
            });
        });

        describe('pause, resume, and stop target checks', () => {
            it('should validate target and check existence for pause, resume, and stop actions (Lines 103 & 113)', () => {
                const rule = new EventsRule();
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);
                const checkTargetExistsSpy = vi.fn();

                const context = createStubContext({
                    events: {
                        evt_playback: {
                            actions: [
                                { type: 'pause', target: 'bgm_theme' },
                                { type: 'resume', target: 'bgm_theme' },
                                { type: 'stop', target: 'sfx_ambient' }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertRequiredType = assertRequiredTypeSpy;
                context.checkTargetExists = checkTargetExistsSpy;

                rule.validate(context);

                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_playback.actions[0].target',
                    'bgm_theme',
                    'string'
                );
                expect(checkTargetExistsSpy).toHaveBeenCalledWith(
                    'evt_playback',
                    'events.evt_playback.actions[0]',
                    'bgm_theme'
                );

                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_playback.actions[1].target',
                    'bgm_theme',
                    'string'
                );
                expect(checkTargetExistsSpy).toHaveBeenCalledWith(
                    'evt_playback',
                    'events.evt_playback.actions[1]',
                    'bgm_theme'
                );

                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_playback.actions[2].target',
                    'sfx_ambient',
                    'string'
                );
                expect(checkTargetExistsSpy).toHaveBeenCalledWith(
                    'evt_playback',
                    'events.evt_playback.actions[2]',
                    'sfx_ambient'
                );
            });
        });

        describe('action schema paths for complex actions', () => {
            it('should assert exact paths for start_loop, stop_loop, and music_transition options (Lines 150, 155, 160, 167, 174, 179, 181, 185, 186, 189, 190)', () => {
                const rule = new EventsRule();
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);
                const assertOptionalTypeSpy = vi.fn().mockReturnValue(true);

                const transitionOptions = {
                    quantize: 'NextBar',
                    crossfadeDuration: 500,
                    tailDuration: 200,
                    interruptable: true,
                    offsetMode: 'Relative'
                };

                const context = createStubContext({
                    soundMap: { bgm_loop: {} as any },
                    events: {
                        evt_music: {
                            actions: [
                                { type: 'start_loop', target: 'bgm_loop', startRegion: 'intro' },
                                { type: 'stop_loop', target: 'bgm_loop' },
                                {
                                    type: 'music_transition',
                                    target: 'bgm_loop',
                                    targetRegion: 'main',
                                    transitionRegionName: 'trans_intro',
                                    options: transitionOptions
                                }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertRequiredType = assertRequiredTypeSpy;
                context.assertOptionalType = assertOptionalTypeSpy;

                rule.validate(context);

                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[0].target',
                    'bgm_loop',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[0].startRegion',
                    'intro',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[1].target',
                    'bgm_loop',
                    'string'
                );

                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[2].target',
                    'bgm_loop',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[2].targetRegion',
                    'main',
                    'string'
                );
                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[2].transitionRegionName',
                    'trans_intro',
                    'string'
                );
                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[2].options',
                    transitionOptions,
                    'object'
                );
                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[2].options.quantize',
                    'NextBar',
                    'string'
                );
                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[2].options.crossfadeDuration',
                    500,
                    'number'
                );
                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[2].options.tailDuration',
                    200,
                    'number'
                );
                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[2].options.interruptable',
                    true,
                    'boolean'
                );
                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_music.actions[2].options.offsetMode',
                    'Relative',
                    'string'
                );
            });

            it('should assert exact paths for play_stinger and add_mixer_modifier (Lines 205, 208, 209, 219, 238)', () => {
                const rule = new EventsRule();
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);
                const assertOptionalTypeSpy = vi.fn().mockReturnValue(true);

                const context = createStubContext({
                    manifest: { sfx_stinger: {} as any },
                    events: {
                        evt_stinger_and_mod: {
                            actions: [
                                {
                                    type: 'play_stinger',
                                    target: 'sfx_stinger',
                                    quantize: 'NextBeat',
                                    referenceTrackId: 'bgm_lead'
                                },
                                {
                                    type: 'add_mixer_modifier',
                                    snapshotName: 'duck_music',
                                    modifierId: 'mod_duck',
                                    priority: 10
                                }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertRequiredType = assertRequiredTypeSpy;
                context.assertOptionalType = assertOptionalTypeSpy;

                rule.validate(context);

                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_stinger_and_mod.actions[0].target',
                    'sfx_stinger',
                    'string'
                );
                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_stinger_and_mod.actions[0].quantize',
                    'NextBeat',
                    'string'
                );
                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_stinger_and_mod.actions[0].referenceTrackId',
                    'bgm_lead',
                    'string'
                );

                expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                    'events.evt_stinger_and_mod.actions[1].priority',
                    10,
                    'number'
                );
            });

            it('should assert schema paths and report errors for trigger_event and load_bank (Lines 249, 250, 254, 264)', () => {
                const rule = new EventsRule();
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);

                const context = createStubContext({
                    banks: { existing_bank: {} as any },
                    events: {
                        evt_target_tests: {
                            actions: [
                                { type: 'trigger_event', target: 'evt_target_tests' },
                                { type: 'trigger_event', target: 'evt_unregistered' },
                                { type: 'load_bank', target: 'missing_dlc_bank' }
                            ]
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertRequiredType = assertRequiredTypeSpy;

                rule.validate(context);

                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_target_tests.actions[0].target',
                    'evt_target_tests',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_target_tests.actions[1].target',
                    'evt_unregistered',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_target_tests.actions[2].target',
                    'missing_dlc_bank',
                    'string'
                );

                expect(context.getErrors()).toContain('Event "evt_target_tests" references itself in action list.');
                expect(context.getErrors()).toContain(
                    'Event "evt_target_tests" references missing event target "evt_unregistered".'
                );
                expect(context.getErrors()).toContain(
                    'Event "evt_target_tests" references missing bank "missing_dlc_bank" at events.evt_target_tests.actions[2].'
                );
            });
        });

        describe('cancel_pending targetTags schema paths and bounds', () => {
            it('should assert required array on targetTags and iterate without out-of-bounds (Lines 278 & 280)', () => {
                const rule = new EventsRule();
                const assertArraySpy = vi.fn().mockReturnValue(true);
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);

                const targetTags = ['tag_ambient', 'tag_vo'];
                const context = createStubContext({
                    events: {
                        evt_cancel: {
                            actions: [{ type: 'cancel_pending', targetTags }]
                        }
                    }
                });
                context.assertArray = assertArraySpy;
                context.assertRequiredType = assertRequiredTypeSpy;

                rule.validate(context);

                expect(assertArraySpy).toHaveBeenCalledWith(
                    'events.evt_cancel.actions[0].targetTags',
                    targetTags,
                    false
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_cancel.actions[0].targetTags[0]',
                    'tag_ambient',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'events.evt_cancel.actions[0].targetTags[1]',
                    'tag_vo',
                    'string'
                );
                expect(assertRequiredTypeSpy).not.toHaveBeenCalledWith(
                    'events.evt_cancel.actions[0].targetTags[2]',
                    expect.anything(),
                    expect.anything()
                );
            });
        });
    });
});
