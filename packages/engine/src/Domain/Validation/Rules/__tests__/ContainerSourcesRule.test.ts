import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest';

import ContainerSourcesRule from '../ContainerSourcesRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('ContainerSourcesRule', () => {
    describe('validate', () => {
        it('should reject when sources is not an array or is empty', () => {
            const rule = new ContainerSourcesRule();
            const contextNotArray = createStubContext({});
            const contextEmpty = createStubContext({});

            rule.validate(contextNotArray, 'soundMap.sfx', 'not-an-array');
            rule.validate(contextEmpty, 'soundMap.sfx', []);

            expect(contextNotArray.getErrors()).toContain(
                'Type Error at "soundMap.sfx.sources": expected array, got string'
            );
            expect(contextEmpty.getErrors()).toContain('"soundMap.sfx.sources" cannot be empty.');
        });

        it('should report error for null or undefined source items', () => {
            const rule = new ContainerSourcesRule();
            const context = createStubContext({});

            rule.validate(context, 'soundMap.sfx', ['sfx_valid', null as any, undefined as any]);

            expect(context.getErrors()).toContain('Source item at "soundMap.sfx.sources[1]" is undefined or null.');
            expect(context.getErrors()).toContain('Source item at "soundMap.sfx.sources[2]" is undefined or null.');
        });

        it('should accept valid string and object source items without weight', () => {
            const rule = new ContainerSourcesRule();
            const context = createStubContext({
                manifest: { sfx_footstep: {} as any },
                soundMap: { sfx_jump: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context, 'soundMap.player', ['sfx_footstep', { id: 'sfx_jump' }]);

            expect(context.getErrors()).toHaveLength(0);
            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should reject non-positive weights (zero and negative) (Lines 37-38)', () => {
            const rule = new ContainerSourcesRule();
            const context = createStubContext({
                manifest: { sfx_coin: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context, 'soundMap.items', [
                { id: 'sfx_coin', weight: 0 },
                { id: 'sfx_coin', weight: -3 }
            ]);

            expect(context.getErrors()).toContain('Weight at "soundMap.items.sources[0].weight" must be > 0.');
            expect(context.getErrors()).toContain('Weight at "soundMap.items.sources[1].weight" must be > 0.');
        });

        it('should extract targetId from object sources and warn when missing from catalogs (Lines 32 & 50)', () => {
            const rule = new ContainerSourcesRule();
            const context = createStubContext({ manifest: {}, soundMap: {} });

            rule.validate(context, 'soundMap.ambience', [{ id: 'sfx_missing_bird', weight: 1.5 }]);

            expect(context.getWarnings()).toContain(
                'Source item at "soundMap.ambience.sources[0]" references missing sound "sfx_missing_bird".'
            );
        });

        it('should not emit missing sound warnings when object id is invalid (Lines 25 & 50)', () => {
            const rule = new ContainerSourcesRule();
            const context = createStubContext({ manifest: {}, soundMap: {} });

            rule.validate(context, 'soundMap.ambience', [{ id: 999 as any }]);

            expect(context.getErrors()).toContain(
                'Type Error at "soundMap.ambience.sources[0].id": expected string, got number'
            );
            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should report error for unsupported primitive types like numbers or booleans (Lines 43-45)', () => {
            const rule = new ContainerSourcesRule();
            const context = createStubContext({});

            rule.validate(context, 'soundMap.ambience', [123 as any, true as any]);

            expect(context.getErrors()).toContain(
                'Invalid source item type at "soundMap.ambience.sources[0]". Expected string or { id: string, weight?: number }'
            );
            expect(context.getErrors()).toContain(
                'Invalid source item type at "soundMap.ambience.sources[1]". Expected string or { id: string, weight?: number }'
            );
        });
    });
});
