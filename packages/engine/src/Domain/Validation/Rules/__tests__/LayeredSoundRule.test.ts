import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it, vi } from 'vitest';

import LayeredSoundRule from '../LayeredSoundRule.js';
import { createStubContext } from './helpers/createStubContext';

describe('LayeredSoundRule', () => {
    describe('validate', () => {
        it('should ignore non-layered sound configurations', () => {
            const rule = new LayeredSoundRule();
            const assertArraySpy = vi.fn();
            const context = createStubContext({});
            context.assertArray = assertArraySpy;

            const nonLayeredConfig: AnySoundConfig = { src: 'audio.ogg' };

            rule.validate('bgm', nonLayeredConfig, context);

            expect(assertArraySpy).not.toHaveBeenCalled();
        });

        it('should assert required non-optional array for layers with exact path and abort if invalid (Line 9)', () => {
            const rule = new LayeredSoundRule();
            const assertArraySpy = vi.fn().mockImplementation((path, val, isOptional) => {
                if (val === undefined && !isOptional) return false;
                return Array.isArray(val);
            });
            const assertRequiredTypeSpy = vi.fn();

            const context = createStubContext({});
            context.assertArray = assertArraySpy;
            context.assertRequiredType = assertRequiredTypeSpy;

            const invalidLayeredConfig = {
                isLayered: true,
                busId: 'master',
                layers: undefined as any
            };

            rule.validate('explosion_layered', invalidLayeredConfig as any, context);

            expect(assertArraySpy).toHaveBeenCalledWith('soundMap.explosion_layered.layers', undefined, false);
            expect(assertRequiredTypeSpy).not.toHaveBeenCalled();
        });

        it('should skip property validation when a layer item is not an object (Line 13)', () => {
            const rule = new LayeredSoundRule();
            const assertRequiredTypeSpy = vi.fn().mockImplementation((path, val, type) => {
                return typeof val === type && val !== null;
            });
            const assertOptionalTypeSpy = vi.fn();

            const context = createStubContext({});
            context.assertRequiredType = assertRequiredTypeSpy;
            context.assertOptionalType = assertOptionalTypeSpy;

            const layeredConfig = {
                isLayered: true,
                busId: 'master',
                layers: ['not_an_object' as any, null as any]
            };

            rule.validate('gunshot', layeredConfig as any, context);

            expect(assertRequiredTypeSpy).toHaveBeenCalledWith('soundMap.gunshot.layers[0]', 'not_an_object', 'object');
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith('soundMap.gunshot.layers[1]', null, 'object');
            expect(assertRequiredTypeSpy).not.toHaveBeenCalledWith(
                'soundMap.gunshot.layers[0].src',
                expect.anything(),
                expect.anything()
            );
            expect(assertOptionalTypeSpy).not.toHaveBeenCalled();
        });

        it('should assert exact schema paths for src, delay, and volume on valid layer items (Lines 14-16)', () => {
            const rule = new LayeredSoundRule();
            const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);
            const assertOptionalTypeSpy = vi.fn().mockReturnValue(true);

            const context = createStubContext({
                manifest: { audio_sub: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            context.assertRequiredType = assertRequiredTypeSpy;
            context.assertOptionalType = assertOptionalTypeSpy;

            const layeredConfig = {
                isLayered: true,
                busId: 'master',
                layers: [{ src: 'audio_sub', delay: 50, volume: 0.8 }]
            };

            rule.validate('synth_lead', layeredConfig as any, context);

            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.synth_lead.layers[0].src',
                'audio_sub',
                'string'
            );
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('soundMap.synth_lead.layers[0].delay', 50, 'number');
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('soundMap.synth_lead.layers[0].volume', 0.8, 'number');
        });

        it('should not emit missing audio error when layer src is undefined (Line 19)', () => {
            const rule = new LayeredSoundRule();
            const context = createStubContext({ manifest: {}, soundMap: {} });

            const layeredConfig = {
                isLayered: true,
                busId: 'master',
                layers: [{ delay: 100 } as any]
            };

            rule.validate('ambient_layer', layeredConfig as any, context);

            const missingAudioErrors = context.getErrors().filter(err => err.includes('references missing audio'));
            expect(missingAudioErrors).toHaveLength(0);
        });

        it('should pass when layer audio exists in manifest or soundMap, and error only when missing in both (Lines 19-21)', () => {
            const rule = new LayeredSoundRule();
            const context = createStubContext({
                manifest: { sfx_from_manifest: {} as any },
                soundMap: { sfx_from_soundmap: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            const validLayeredConfig = {
                isLayered: true,
                busId: 'master',
                layers: [{ src: 'sfx_from_manifest' }, { src: 'sfx_from_soundmap' }]
            };

            const invalidLayeredConfig = {
                isLayered: true,
                busId: 'master',
                layers: [{ src: 'sfx_ghost_audio' }]
            };

            rule.validate('valid_mix', validLayeredConfig as any, context);
            rule.validate('invalid_mix', invalidLayeredConfig as any, context);

            expect(context.getErrors()).toEqual([
                'Layered sound "invalid_mix" references missing audio "sfx_ghost_audio"'
            ]);
        });
    });
});
