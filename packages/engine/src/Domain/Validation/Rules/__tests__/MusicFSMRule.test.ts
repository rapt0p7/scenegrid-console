import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it, vi } from 'vitest';

import MusicFSMRule from '../MusicFSMRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('MusicFSMRule', () => {
    describe('validate', () => {
        it('should cleanly exit when musicFSM is absent or empty', () => {
            const rule = new MusicFSMRule();
            const contextAbsent = createStubContext({ musicFSM: undefined });
            const contextEmpty = createStubContext({ musicFSM: {} as any });

            rule.validate(contextAbsent);
            rule.validate(contextEmpty);

            expect(contextAbsent.getErrors()).toHaveLength(0);
            expect(contextEmpty.getErrors()).toHaveLength(0);
        });

        it('should validate valid circular transitions and pass without errors', () => {
            const rule = new MusicFSMRule();
            const context = createStubContext({
                soundMap: {
                    s1: { smartLoop: { regions: { r1: [0, 1000] } } } as any
                },
                musicFSM: {
                    initialState: 'A',
                    globalEdges: [],
                    states: {
                        A: {
                            id: 'A',
                            soundId: 's1',
                            sequencerRegion: 'r1',
                            edges: [{ targetState: 'B', conditions: [] }]
                        },
                        B: {
                            id: 'B',
                            soundId: 's1',
                            sequencerRegion: 'r1',
                            edges: [{ targetState: 'A', conditions: [] }]
                        }
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should abort early if initialState is not a string (Line 16)', () => {
            const rule = new MusicFSMRule();
            const context = createStubContext({
                musicFSM: {
                    initialState: 123 as any,
                    states: {}
                } as any
            });

            rule.validate(context);

            expect(context.getErrors()).toContain('Type Error at "musicFSM.initialState": expected string, got number');
        });

        it('should assert required non-optional array for globalEdges with exact path (Line 17)', () => {
            const rule = new MusicFSMRule();
            const assertArraySpy = vi.fn().mockReturnValue(true);
            const context = createStubContext({
                musicFSM: {
                    initialState: 'Intro',
                    globalEdges: [],
                    states: { Intro: { id: 'Intro', soundId: 's1', sequencerRegion: 'r1' } as any }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            context.assertArray = assertArraySpy;

            rule.validate(context);

            expect(assertArraySpy).toHaveBeenCalledWith('musicFSM.globalEdges', [], false);
        });

        it('should report error and abort when states dictionary is missing or not an object (Lines 19-20)', () => {
            const rule = new MusicFSMRule();
            const contextNull = createStubContext({
                musicFSM: { initialState: 'Intro', states: null as any } as any
            });
            const contextPrimitive = createStubContext({
                musicFSM: { initialState: 'Intro', states: 'invalid' as any } as any
            });

            rule.validate(contextNull);
            rule.validate(contextPrimitive);

            expect(contextNull.getErrors()).toContain('musicFSM.states must be an object.');
            expect(contextPrimitive.getErrors()).toContain('musicFSM.states must be an object.');
        });

        it('should report error when initialState is not defined in the states dictionary (Lines 24-25)', () => {
            const rule = new MusicFSMRule();
            const context = createStubContext({
                musicFSM: {
                    initialState: 'Intro',
                    states: {
                        Battle: { id: 'Battle', soundId: 's1', sequencerRegion: 'r1' } as any
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain('musicFSM.initialState "Intro" is missing from states dictionary.');
        });

        it('should report error when state node is null or not an object (Lines 43-44)', () => {
            const rule = new MusicFSMRule();
            const context = createStubContext({
                musicFSM: {
                    initialState: 'StateA',
                    states: {
                        StateA: null as any,
                        StateB: 123 as any
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain('musicFSM.states.StateA must be an object.');
            expect(context.getErrors()).toContain('musicFSM.states.StateB must be an object.');
        });

        it('should report error when soundId is missing from soundMap or not smartLoop (Lines 50, 51, 54)', () => {
            const rule = new MusicFSMRule();
            const context = createStubContext({
                soundMap: {
                    s_standard: { src: 'audio.ogg' } as any
                },
                musicFSM: {
                    initialState: 'StateA',
                    states: {
                        StateA: { id: 'StateA', soundId: 's_missing', sequencerRegion: 'r1' } as any,
                        StateB: { id: 'StateB', soundId: 's_standard', sequencerRegion: 'r1' } as any
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain(
                'musicFSM.states.StateA.soundId "s_missing" does not exist in soundMap.'
            );
            expect(context.getErrors()).toContain(
                'musicFSM.states.StateB.soundId "s_standard" is linked to MusicFSM, but its config type in soundMap is NOT smartLoop.'
            );
        });

        it('should report error when sequencerRegion is missing from smartLoop.regions (Lines 57 & 60)', () => {
            const rule = new MusicFSMRule();
            const context = createStubContext({
                soundMap: {
                    s_smart: { smartLoop: { regions: { region_main: [0, 1000] } } } as any
                },
                musicFSM: {
                    initialState: 'Explore',
                    states: {
                        Explore: { id: 'Explore', soundId: 's_smart', sequencerRegion: 'region_missing' } as any
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain(
                'musicFSM.states.Explore.sequencerRegion "region_missing" is missing from smartLoop.regions inside sound "s_smart".'
            );
        });

        it('should validate activeSnapshot against snapshots configuration (Lines 68 & 71)', () => {
            const rule = new MusicFSMRule();
            const context = createStubContext({
                snapshots: {},
                soundMap: {
                    s_smart: { smartLoop: { regions: { r1: [0, 1000] } } } as any
                },
                musicFSM: {
                    initialState: 'Battle',
                    states: {
                        Battle: {
                            id: 'Battle',
                            soundId: 's_smart',
                            sequencerRegion: 'r1',
                            activeSnapshot: 'missing_snap'
                        } as any
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain(
                'musicFSM.states.Battle.activeSnapshot "missing_snap" does not exist in global snapshots configuration.'
            );
        });

        it('should validate global edges path and report error for non-object edge (Lines 31, 92, 93)', () => {
            const rule = new MusicFSMRule();
            const context = createStubContext({
                soundMap: { s_smart: { smartLoop: { regions: { r1: [0, 1000] } } } as any },
                musicFSM: {
                    initialState: 'StateA',
                    globalEdges: [null as any],
                    states: {
                        StateA: { id: 'StateA', soundId: 's_smart', sequencerRegion: 'r1' } as any
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain('musicFSM.globalEdges[0] must be an object.');
        });

        it('should report errors for transitionRegionName when target sound is missing or missing region (Lines 105-125)', () => {
            const rule = new MusicFSMRule();
            const context = createStubContext({
                soundMap: {
                    s_smart: { smartLoop: { regions: { intro: [0, 1000] } } } as any,
                    s_standard: { src: 'audio.ogg' } as any
                },
                musicFSM: {
                    initialState: 'StateA',
                    states: {
                        StateA: {
                            id: 'StateA',
                            soundId: 's_smart',
                            sequencerRegion: 'intro',
                            edges: [
                                { targetState: 'StateB', transitionRegionName: 'trans_bridge' },
                                { targetState: 'StateC', transitionRegionName: 'trans_bridge' },
                                { targetState: 'StateD', transitionRegionName: 'trans_bridge' },
                                { targetState: 'StateE', transitionRegionName: 'missing_region' }
                            ]
                        } as any,
                        StateB: { id: 'StateB' } as any,
                        StateC: { id: 'StateC', soundId: 's_missing' } as any,
                        StateD: { id: 'StateD', soundId: 's_standard' } as any,
                        StateE: { id: 'StateE', soundId: 's_smart', sequencerRegion: 'intro' } as any
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            const errors = context.getErrors();
            expect(errors).toContain(
                'musicFSM.states.StateA.edges[0].transitionRegionName is set, but target state "StateB" is missing soundId.'
            );
            expect(errors).toContain(
                'musicFSM.states.StateA.edges[1].transitionRegionName points to soundId "s_missing" which does not exist in soundMap.'
            );
            expect(errors).toContain(
                'musicFSM.states.StateA.edges[2].transitionRegionName requires target sound "s_standard" to be a smartLoop.'
            );
            expect(errors).toContain(
                'musicFSM.states.StateA.edges[3].transitionRegionName "missing_region" is missing from smartLoop.regions inside sound "s_smart".'
            );
        });

        it('should report error when edge stingerId does not exist in soundMap (Lines 133 & 135)', () => {
            const rule = new MusicFSMRule();
            const context = createStubContext({
                soundMap: {
                    s_smart: { smartLoop: { regions: { r1: [0, 1000] } } } as any
                },
                musicFSM: {
                    initialState: 'StateA',
                    states: {
                        StateA: {
                            id: 'StateA',
                            soundId: 's_smart',
                            sequencerRegion: 'r1',
                            edges: [{ targetState: 'StateA', stingerId: 'sfx_ghost_stinger' }]
                        } as any
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain(
                'musicFSM.states.StateA.edges[0].stingerId "sfx_ghost_stinger" does not exist in soundMap.'
            );
        });

        it('should validate edge conditions and report unknown RTPC params (Lines 140, 146, 147, 151, 153)', () => {
            const rule = new MusicFSMRule();
            const context = createStubContext({
                rtpcManifest: { combat_intensity: {} as any },
                soundMap: { s_smart: { smartLoop: { regions: { r1: [0, 1000] } } } as any },
                musicFSM: {
                    initialState: 'StateA',
                    states: {
                        StateA: {
                            id: 'StateA',
                            soundId: 's_smart',
                            sequencerRegion: 'r1',
                            edges: [
                                {
                                    targetState: 'StateA',
                                    conditions: [null as any, { param: 'unregistered_rtpc_param' }]
                                }
                            ]
                        } as any
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain('musicFSM.states.StateA.edges[0].conditions[0] must be an object.');
            expect(context.getErrors()).toContain(
                'musicFSM.states.StateA.edges[0].conditions[1].param "unregistered_rtpc_param" is missing from global RTPCManifest.'
            );
        });

        describe('state node schema paths and guards', () => {
            it('should assert exact schema paths for soundId, sequencerRegion, activeSnapshot, and optional edges (Lines 48, 57, 68, 77)', () => {
                const rule = new MusicFSMRule();
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);
                const assertArraySpy = vi.fn().mockReturnValue(true);

                const context = createStubContext({
                    soundMap: {
                        s_smart: { smartLoop: { regions: { r1: [0, 1000] } } } as any
                    },
                    snapshots: {
                        snap_combat: {} as any
                    },
                    musicFSM: {
                        initialState: 'Battle',
                        globalEdges: [],
                        states: {
                            Battle: {
                                id: 'Battle',
                                soundId: 's_smart',
                                sequencerRegion: 'r1',
                                activeSnapshot: 'snap_combat',
                                edges: undefined
                            } as any
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertRequiredType = assertRequiredTypeSpy;
                context.assertArray = assertArraySpy;

                rule.validate(context);

                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'musicFSM.states.Battle.soundId',
                    's_smart',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'musicFSM.states.Battle.sequencerRegion',
                    'r1',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'musicFSM.states.Battle.activeSnapshot',
                    'snap_combat',
                    'string'
                );
                expect(assertArraySpy).toHaveBeenCalledWith('musicFSM.states.Battle.edges', undefined, true);
            });

            it('should skip catalog lookups when soundId, sequencerRegion, or activeSnapshot fail type check (Lines 48, 57, 68)', () => {
                const rule = new MusicFSMRule();
                const context = createStubContext({
                    soundMap: {},
                    snapshots: {},
                    musicFSM: {
                        initialState: 'StateA',
                        globalEdges: [],
                        states: {
                            StateA: {
                                id: 'StateA',
                                soundId: 123 as any,
                                sequencerRegion: 456 as any,
                                activeSnapshot: 789 as any
                            } as any
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                const errors = context.getErrors();
                expect(errors).toContain('Type Error at "musicFSM.states.StateA.soundId": expected string, got number');
                expect(errors).toContain(
                    'Type Error at "musicFSM.states.StateA.activeSnapshot": expected string, got number'
                );
                expect(errors.filter(e => e.includes('does not exist in soundMap'))).toHaveLength(0);
                expect(errors.filter(e => e.includes('does not exist in global snapshots'))).toHaveLength(0);
            });
        });

        describe('edge validation and targetState verbatim error', () => {
            it('should report error and abort when an edge is null or a primitive (Line 92)', () => {
                const rule = new MusicFSMRule();
                const context = createStubContext({
                    soundMap: { s1: { smartLoop: { regions: { r1: [0, 1000] } } } as any },
                    musicFSM: {
                        initialState: 'StateA',
                        globalEdges: [],
                        states: {
                            StateA: {
                                id: 'StateA',
                                soundId: 's1',
                                sequencerRegion: 'r1',
                                edges: [null as any, 'primitive_edge' as any]
                            } as any
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getErrors()).toContain('musicFSM.states.StateA.edges[0] must be an object.');
                expect(context.getErrors()).toContain('musicFSM.states.StateA.edges[1] must be an object.');
            });

            it('should assert exact schema path for targetState and abort if not a string (Line 97)', () => {
                const rule = new MusicFSMRule();
                const context = createStubContext({
                    soundMap: { s1: { smartLoop: { regions: { r1: [0, 1000] } } } as any },
                    musicFSM: {
                        initialState: 'StateA',
                        globalEdges: [],
                        states: {
                            StateA: {
                                id: 'StateA',
                                soundId: 's1',
                                sequencerRegion: 'r1',
                                edges: [{ targetState: 999 as any, conditions: [] }]
                            } as any
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                const assertRequiredTypeSpy = vi.spyOn(context, 'assertRequiredType');

                rule.validate(context);

                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'musicFSM.states.StateA.edges[0].targetState',
                    999,
                    'string'
                );
                expect(context.getErrors()).toContain(
                    'Type Error at "musicFSM.states.StateA.edges[0].targetState": expected string, got number'
                );
                expect(context.getErrors().filter(e => e.includes('points to a non-existent state node'))).toHaveLength(
                    0
                );
            });

            it('should match the verbatim error string when targetState points to a non-existent state (Line 101)', () => {
                const rule = new MusicFSMRule();
                const context = createStubContext({
                    soundMap: { s1: { smartLoop: { regions: { r1: [0, 1000] } } } as any },
                    musicFSM: {
                        initialState: 'StateA',
                        globalEdges: [],
                        states: {
                            StateA: {
                                id: 'StateA',
                                soundId: 's1',
                                sequencerRegion: 'r1',
                                edges: [{ targetState: 'NON_EXISTENT_STATE', conditions: [] }]
                            } as any
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getErrors()).toEqual([
                    'musicFSM.states.StateA.edges[0].targetState "NON_EXISTENT_STATE" points to a non-existent state node.'
                ]);
            });
        });

        describe('transitionRegionName empty string and undefined invariants', () => {
            it('should ignore transition region validation when transitionRegionName is undefined or empty string (Line 105)', () => {
                const rule = new MusicFSMRule();
                const context = createStubContext({
                    soundMap: {
                        s1: { smartLoop: { regions: { r1: [0, 1000] } } } as any
                    },
                    musicFSM: {
                        initialState: 'StateA',
                        globalEdges: [],
                        states: {
                            StateA: {
                                id: 'StateA',
                                soundId: 's1',
                                sequencerRegion: 'r1',
                                edges: [
                                    { targetState: 'StateB', transitionRegionName: undefined, conditions: [] },
                                    { targetState: 'StateB', transitionRegionName: '', conditions: [] } // Empty string
                                ]
                            } as any,
                            StateB: {
                                id: 'StateB',
                                soundId: 's1',
                                sequencerRegion: 'r1',
                                edges: []
                            } as any
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getErrors()).toHaveLength(0);
            });
        });

        describe('stingerId and condition param schema paths and type guards', () => {
            it('should assert exact schema paths for stingerId and condition param (Lines 133 & 151)', () => {
                const rule = new MusicFSMRule();
                const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);
                const assertArraySpy = vi.fn().mockReturnValue(true);

                const context = createStubContext({
                    rtpcManifest: { intensity: {} as any },
                    soundMap: {
                        s1: { smartLoop: { regions: { r1: [0, 1000] } } } as any,
                        s_stinger: { src: 'stinger.ogg' } as any
                    },
                    musicFSM: {
                        initialState: 'StateA',
                        globalEdges: [],
                        states: {
                            StateA: {
                                id: 'StateA',
                                soundId: 's1',
                                sequencerRegion: 'r1',
                                edges: [
                                    {
                                        targetState: 'StateA',
                                        stingerId: 's_stinger',
                                        conditions: [{ param: 'intensity' }]
                                    }
                                ]
                            } as any
                        }
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);
                context.assertRequiredType = assertRequiredTypeSpy;
                context.assertArray = assertArraySpy;

                rule.validate(context);

                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'musicFSM.states.StateA.edges[0].stingerId',
                    's_stinger',
                    'string'
                );
                expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                    'musicFSM.states.StateA.edges[0].conditions[0].param',
                    'intensity',
                    'string'
                );
            });
        });
    });
});
