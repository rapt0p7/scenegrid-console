import { describe, expect, it, vi } from 'vitest';

import SpatialSettingsRule from '../SpatialSettingsRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('SpatialSettingsRule', () => {
    describe('validate', () => {
        it('should ignore sounds without spatial configuration', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            rule.validate('sfx_plain', { src: 'audio.ogg' }, context);

            expect(assertOptionalTypeSpy).not.toHaveBeenCalled();
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should exit immediately when spatial is undefined without calling assertOptionalType (Line 13)', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            rule.validate('sfx_ui', { spatial: undefined }, context);

            expect(assertOptionalTypeSpy).not.toHaveBeenCalled();
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should accept all 3 valid distanceModel values (linear, inverse, exponential) (Lines 18 & 19)', () => {
            const rule = new SpatialSettingsRule();
            const validModels = ['linear', 'inverse', 'exponential'] as const;

            for (const model of validModels) {
                const context = createStubContext({});
                rule.validate('sfx_emitter', { spatial: { distanceModel: model } }, context);
                expect(context.getErrors()).toHaveLength(0);
            }
        });

        it('should reject invalid distanceModel values with verbatim error (Line 20)', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});

            rule.validate('sfx_emitter', { spatial: { distanceModel: 'logarithmic' as any } }, context);

            expect(context.getErrors()).toEqual(['Sound "sfx_emitter" has invalid distanceModel: "logarithmic"']);
        });

        it('should assert exact schema paths for refDistance, maxDistance, and rolloffFactor (Lines 24-28)', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            const soundConfig = {
                spatial: {
                    refDistance: 2.0,
                    maxDistance: 50.0,
                    rolloffFactor: 1.5
                }
            };

            rule.validate('audio_3d', soundConfig, context);

            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('soundMap.audio_3d.spatial.refDistance', 2.0, 'number');
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('soundMap.audio_3d.spatial.maxDistance', 50.0, 'number');
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                'soundMap.audio_3d.spatial.rolloffFactor',
                1.5,
                'number'
            );
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should accept valid 3D position [x, y, z] and assert exact indexed element paths (Lines 38-41)', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});
            const assertRequiredTypeSpy = vi.spyOn(context, 'assertRequiredType');
            const assertArraySpy = vi.spyOn(context, 'assertArray');

            const soundConfig = {
                spatial: {
                    position: [10.5, 0.0, -5.2]
                }
            };

            rule.validate('laser_emitter', soundConfig as any, context);

            expect(assertArraySpy).toHaveBeenCalledWith(
                'soundMap.laser_emitter.spatial.position',
                [10.5, 0.0, -5.2],
                false
            );
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.laser_emitter.spatial.position[0]',
                10.5,
                'number'
            );
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.laser_emitter.spatial.position[1]',
                0.0,
                'number'
            );
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.laser_emitter.spatial.position[2]',
                -5.2,
                'number'
            );
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should reject position vectors with length !== 3 with verbatim error (Lines 38 & 43)', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});

            const sound2D = { spatial: { position: [10, 20] } };
            const sound4D = { spatial: { position: [10, 20, 30, 40] } };

            rule.validate('sound_2d', sound2D as any, context);
            rule.validate('sound_4d', sound4D as any, context);

            expect(context.getErrors()).toContain('Sound "sound_2d" spatial.position must be [x, y, z] (3 numbers)');
            expect(context.getErrors()).toContain('Sound "sound_4d" spatial.position must be [x, y, z] (3 numbers)');
        });

        it('should not perform position array checks when position is omitted (Line 35)', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});
            const assertArraySpy = vi.spyOn(context, 'assertArray');

            const soundConfig = {
                spatial: {
                    refDistance: 1.0
                }
            };

            rule.validate('sound_no_pos', soundConfig, context);

            expect(assertArraySpy).not.toHaveBeenCalledWith(
                'soundMap.sound_no_pos.spatial.position',
                expect.anything(),
                expect.anything()
            );
            expect(context.getErrors()).toHaveLength(0);
        });
    });
});
