import { describe, expect, it, vi } from 'vitest';

import RTPCManifestRule from '../RTPCManifestRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('RTPCManifestRule', () => {
    describe('validate', () => {
        it('should exit immediately without performing schema assertions when rtpcManifest is absent (Line 7)', () => {
            const rule = new RTPCManifestRule();
            const context = createStubContext({});
            // @ts-expect-error Rewriting for test
            context.config.rtpcManifest = undefined as any;

            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            rule.validate(context);

            expect(assertOptionalTypeSpy).not.toHaveBeenCalled();
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should not invoke assertOptionalType for attack, release, and defaultValue when omitted (Lines 16, 20, 24)', () => {
            const rule = new RTPCManifestRule();
            const context = createStubContext({});
            // @ts-expect-error Rewriting for test
            context.config.rtpcManifest = {
                rpm: {}
            } as any;

            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            rule.validate(context);

            expect(assertOptionalTypeSpy).toHaveBeenCalledTimes(1);
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('rtpcManifest', expect.anything(), 'object');
        });

        it('should validate exact schema paths for attack, release, and defaultValue when defined (Lines 16, 20, 24)', () => {
            const rule = new RTPCManifestRule();
            const context = createStubContext({});
            // @ts-expect-error Rewriting for test
            context.config.rtpcManifest = {
                cutoff: {
                    attack: 0.05,
                    release: 0.2,
                    defaultValue: 1000
                }
            } as any;

            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            rule.validate(context);

            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('rtpcManifest.cutoff.attack', 0.05, 'number');
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('rtpcManifest.cutoff.release', 0.2, 'number');
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('rtpcManifest.cutoff.defaultValue', 1000, 'number');
            expect(context.getErrors()).toHaveLength(0);
        });
    });
});
