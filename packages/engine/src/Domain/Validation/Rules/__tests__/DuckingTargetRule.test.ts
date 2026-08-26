import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';

import { createStubContext } from '@domain/Validation/Rules/__tests__/helpers/createStubContext';
import { BusId } from '@scene-grid/shared';
import { describe, expect, it } from 'vitest';

import DuckingTargetRule from '../DuckingTargetRule.js';

describe('DuckingTargetRule', () => {
    describe('validate', () => {
        it('should ignore sounds without ducking configuration', () => {
            const rule = new DuckingTargetRule();
            const context = createStubContext({ buses: { master: {} } });
            const soundConfig: AnySoundConfig = { src: 'audio/fx.ogg' };

            rule.validate('sfx_ambient', soundConfig, context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should accept ducking configuration when target is omitted/undefined (Line 18)', () => {
            const rule = new DuckingTargetRule();
            const context = createStubContext({ buses: { master: {} } });
            const soundConfig: AnySoundConfig = {
                ducking: { intensity: 0.5 }
            };

            rule.validate('sfx_explosion', soundConfig, context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should report error for non-string ducking targets', () => {
            const rule = new DuckingTargetRule();
            const context = createStubContext({ buses: { master: {} } });
            const soundConfig: AnySoundConfig = {
                ducking: { target: 123 as any }
            };

            rule.validate('sfx_bad_target', soundConfig, context);

            expect(context.getErrors()).toContain('Sound "sfx_bad_target" has non-string ducking target');
        });

        it('should report exact error when ducking targets an unknown bus (Lines 25 & 33)', () => {
            const rule = new DuckingTargetRule();
            const context = createStubContext({
                buses: { master: {}, sfx: {} }
            });
            const soundConfig: AnySoundConfig = {
                ducking: { target: 'ghost_bus' as BusId }
            };

            rule.validate('dialogue_line_1', soundConfig, context);

            expect(context.getErrors()).toContain('Sound "dialogue_line_1" has invalid ducking target "ghost_bus"');
        });

        it('should report error when target bus exists but sidechain is not enabled (Line 27)', () => {
            const rule = new DuckingTargetRule();
            const context = createStubContext({
                buses: {
                    music: { sidechain: { enabled: false } },
                    ambience: {}
                }
            });

            const soundA: AnySoundConfig = { ducking: { target: 'music' as BusId } };
            const soundB: AnySoundConfig = { ducking: { target: 'ambience' as BusId } };

            rule.validate('vo_intro', soundA, context);
            rule.validate('vo_outro', soundB, context);

            expect(context.getErrors()).toContain(
                'Sound "vo_intro" targets bus "music" for ducking, but sidechain is not enabled on "music" bus.'
            );
            expect(context.getErrors()).toContain(
                'Sound "vo_outro" targets bus "ambience" for ducking, but sidechain is not enabled on "ambience" bus.'
            );
        });

        it('should pass with zero errors when target bus has sidechain enabled (Line 27)', () => {
            const rule = new DuckingTargetRule();
            const context = createStubContext({
                buses: {
                    music: { sidechain: { enabled: true } },
                    ambience: { sidechain: { enabled: true } }
                }
            });

            const soundConfig: AnySoundConfig = {
                ducking: {
                    target: ['music', 'ambience'] as BusId[]
                }
            };

            rule.validate('voice_over', soundConfig, context);

            expect(context.getErrors()).toHaveLength(0);
        });
    });
});
