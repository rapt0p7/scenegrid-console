import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest';

import OrphanManifestRule from '../OrphanManifestRule.js';
import { createStubContext } from './helpers/createStubContext';

describe('OrphanManifestRule', () => {
    describe('validate', () => {
        it('should safely skip null and primitive soundMap entries without throwing (Line 13)', () => {
            const rule = new OrphanManifestRule();
            const context = createStubContext({
                manifest: { sfx_valid: {} as any },
                soundMap: {
                    corruptedNull: null as any,
                    corruptedNumber: 123 as any,
                    corruptedString: 'invalid' as any,
                    sfx_valid: { src: 'sfx_valid' }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            expect(() => {
                rule.validate(context);
            }).not.toThrow();
            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should mark all layer.src audio entries as referenced and ignore invalid layer items (Lines 15, 18, 20)', () => {
            const rule = new OrphanManifestRule();
            const context = createStubContext({
                manifest: {
                    layer_audio_1: {} as any,
                    layer_audio_2: {} as any,
                    orphan_manifest_audio: {} as any
                },
                soundMap: {
                    explosion_layered: {
                        isLayered: true,
                        layers: [
                            { src: 'layer_audio_1' },
                            { src: 'layer_audio_2' },
                            null as any,
                            { src: undefined } as any
                        ]
                    } as any,
                    invalid_layered: {
                        isLayered: true,
                        layers: 'not-an-array' as any
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toEqual([
                'Manifest sound "orphan_manifest_audio" is not referenced in SoundMap'
            ]);
        });

        it('should mark string and object sources from both containers and scatterers as referenced (Lines 23, 26, 30)', () => {
            const rule = new OrphanManifestRule();
            const context = createStubContext({
                manifest: {
                    sfx_container_str: {} as any,
                    sfx_container_obj: {} as any,
                    sfx_scatterer_str: {} as any,
                    sfx_scatterer_obj: {} as any,
                    sfx_unreferenced: {} as any
                },
                soundMap: {
                    container_sound: {
                        isContainer: true,
                        sources: ['sfx_container_str', { id: 'sfx_container_obj', weight: 2 }]
                    } as any,
                    scatterer_sound: {
                        isScatterer: true,
                        sources: ['sfx_scatterer_str', { id: 'sfx_scatterer_obj', weight: 1 }]
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toEqual(['Manifest sound "sfx_unreferenced" is not referenced in SoundMap']);
        });

        it('should mark all switch targets and defaultSwitch as referenced (Lines 35-44)', () => {
            const rule = new OrphanManifestRule();
            const context = createStubContext({
                manifest: {
                    sfx_wood: {} as any,
                    sfx_stone: {} as any,
                    sfx_default_footstep: {} as any,
                    orphan_manifest: {} as any
                },
                soundMap: {
                    footstep_switch: {
                        isSwitch: true,
                        switches: {
                            wood: 'sfx_wood',
                            stone: 'sfx_stone',
                            corruptedNonString: 123 as any
                        },
                        defaultSwitch: 'sfx_default_footstep'
                    } as any,
                    invalid_switch_array: {
                        isSwitch: true,
                        switches: ['not_an_object_map'] as any,
                        defaultSwitch: 456 as any
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toEqual(['Manifest sound "orphan_manifest" is not referenced in SoundMap']);
        });

        it('should mark smartLoop keys, sound.src values, and direct matching keys as referenced (Lines 46-51)', () => {
            const rule = new OrphanManifestRule();
            const context = createStubContext({
                manifest: {
                    bgm_smartloop: {} as any,
                    audio_asset_file: {} as any,
                    direct_key_match: {} as any,
                    orphan_unused: {} as any
                },
                soundMap: {
                    bgm_smartloop: {
                        smartLoop: { regions: { r1: [0, 1000] } }
                    } as any,
                    sfx_gunshot: {
                        src: 'audio_asset_file'
                    },
                    direct_key_match: {} as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toEqual(['Manifest sound "orphan_unused" is not referenced in SoundMap']);
        });

        it('should safely skip when layered.layers is an object dictionary instead of an array (Line 18)', () => {
            const rule = new OrphanManifestRule();
            const context = createStubContext({
                manifest: { sfx_orphan: {} as any },
                soundMap: {
                    bad_layers: {
                        isLayered: true,
                        layers: { layer1: { src: 'sfx_orphan' } } as any
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            expect(() => {
                rule.validate(context);
            }).not.toThrow();
            expect(context.getWarnings()).toEqual(['Manifest sound "sfx_orphan" is not referenced in SoundMap']);
        });

        it('should safely handle switch sounds with undefined, null, or primitive switches (Line 36)', () => {
            const rule = new OrphanManifestRule();
            const context = createStubContext({
                manifest: { sfx_unused: {} as any },
                soundMap: {
                    switch_no_switches: {
                        isSwitch: true,
                        switches: undefined as any
                    } as any,
                    switch_null_switches: {
                        isSwitch: true,
                        switches: null as any
                    } as any,
                    switch_primitive_switches: {
                        isSwitch: true,
                        switches: 123 as any
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            expect(() => {
                rule.validate(context);
            }).not.toThrow();
            expect(context.getWarnings()).toEqual(['Manifest sound "sfx_unused" is not referenced in SoundMap']);
        });

        it('should ignore non-string switch targets and non-string defaultSwitch (Lines 38 & 43)', () => {
            const rule = new OrphanManifestRule();
            const context = createStubContext({
                manifest: {
                    sfx_valid: {} as any,
                    sfx_unreferenced: {} as any
                },
                soundMap: {
                    switch_sound: {
                        isSwitch: true,
                        switches: {
                            surface_wood: 'sfx_valid',
                            surface_invalid_num: 123 as any,
                            surface_invalid_obj: {} as any
                        },
                        defaultSwitch: 456 as any
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toEqual(['Manifest sound "sfx_unreferenced" is not referenced in SoundMap']);
        });

        it('should not decompose string primitive switches into single-character references (Line 36:37)', () => {
            const rule = new OrphanManifestRule();
            const context = createStubContext({
                manifest: {
                    s: {} as any,
                    orphan_sound: {} as any
                },
                soundMap: {
                    invalid_switch: {
                        isSwitch: true,
                        switches: 'sound_id' as any
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toEqual([
                'Manifest sound "s" is not referenced in SoundMap',
                'Manifest sound "orphan_sound" is not referenced in SoundMap'
            ]);
        });
    });
});
