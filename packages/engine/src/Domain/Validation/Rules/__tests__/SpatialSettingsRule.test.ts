import type { BusId } from '@scene-grid/shared';

import { describe, expect, it, vi } from 'vitest';

import SpatialSettingsRule from '../SpatialSettingsRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('SpatialSettingsRule', () => {
    describe('validate', () => {
        it('should ignore sounds without spatial configuration', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            rule.validate('sfx_plain', { busId: 'master' as BusId }, context);

            expect(assertOptionalTypeSpy).not.toHaveBeenCalled();
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should exit immediately when spatial is undefined without calling assertOptionalType (Line 13)', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            rule.validate('sfx_ui', { busId: 'master' as BusId, spatial: undefined }, context);

            expect(assertOptionalTypeSpy).not.toHaveBeenCalled();
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should accept all 3 valid distanceModel values (linear, inverse, exponential) (Lines 18 & 19)', () => {
            const rule = new SpatialSettingsRule();
            const validModels = ['linear', 'inverse', 'exponential'] as const;

            for (const model of validModels) {
                const context = createStubContext({});
                rule.validate('sfx_emitter', { busId: 'master' as BusId, spatial: { distanceModel: model } }, context);
                expect(context.getErrors()).toHaveLength(0);
            }
        });

        it('should reject invalid distanceModel values with verbatim error (Line 20)', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});

            rule.validate(
                'sfx_emitter',
                { busId: 'master' as BusId, spatial: { distanceModel: 'logarithmic' as any } },
                context
            );

            expect(context.getErrors()).toEqual(['Sound "sfx_emitter" has invalid distanceModel: "logarithmic"']);
        });

        it('should assert exact schema paths for refDistance, maxDistance, and rolloffFactor (Lines 24-28)', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            const soundConfig = {
                busId: 'master' as BusId,
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

        it('should accept boolean spatial values (true and false) without errors', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});

            rule.validate('sfx_spatial_on', { busId: 'master' as BusId, spatial: true }, context);
            rule.validate('sfx_spatial_off', { busId: 'master' as BusId, spatial: false }, context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should reject non-boolean, non-object spatial values (string, number, array)', () => {
            const rule = new SpatialSettingsRule();
            const context = createStubContext({});

            rule.validate('s_str', { busId: 'master' as BusId, spatial: 'invalid' as any }, context);
            rule.validate('s_num', { busId: 'master' as BusId, spatial: 123 as any }, context);
            rule.validate('s_arr', { busId: 'master' as BusId, spatial: [1, 2, 3] as any }, context);

            expect(context.getErrors()).toEqual([
                'Type Error at "soundMap.s_str.spatial": expected boolean or object, got string',
                'Type Error at "soundMap.s_num.spatial": expected boolean or object, got number',
                'Type Error at "soundMap.s_arr.spatial": expected boolean or object, got array'
            ]);
        });

        it('should accept valid panningModel values and reject invalid ones', () => {
            const rule = new SpatialSettingsRule();
            const validContext = createStubContext({});

            rule.validate('s_hrtf', { busId: 'master' as BusId, spatial: { panningModel: 'HRTF' } }, validContext);
            rule.validate('s_eq', { busId: 'master' as BusId, spatial: { panningModel: 'equalpower' } }, validContext);
            expect(validContext.getErrors()).toHaveLength(0);

            const badContext = createStubContext({});
            rule.validate(
                's_bad_pan',
                { busId: 'master' as BusId, spatial: { panningModel: 'binaural' as any } },
                badContext
            );
            expect(badContext.getErrors()).toEqual(['Sound "s_bad_pan" has invalid panningModel: "binaural"']);
        });
    });
});
