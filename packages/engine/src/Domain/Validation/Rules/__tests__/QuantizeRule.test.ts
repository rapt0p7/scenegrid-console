import { describe, expect, it } from 'vitest';

import QuantizeRule from '../QuantizeRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('QuantizeRule', () => {
    it('requires quantize by default when options are omitted and errors on null/undefined', () => {
        const rule = new QuantizeRule();
        const context = createStubContext({});

        rule.validate(context, 'test.a.quantize', undefined);
        rule.validate(context, 'test.b.quantize', null);

        expect(context.getErrors()).toEqual([
            'Missing required field at "test.a.quantize"',
            'Missing required field at "test.b.quantize"'
        ]);
    });

    it('allows null and undefined when required is false', () => {
        const rule = new QuantizeRule();
        const context = createStubContext({});

        rule.validate(context, 'test.a.quantize', undefined, { required: false });
        rule.validate(context, 'test.b.quantize', null, { required: false });

        expect(context.getErrors()).toHaveLength(0);
    });

    it('accepts valid string quantize values and rejects invalid strings', () => {
        const rule = new QuantizeRule();
        const validContext = createStubContext({});

        for (const q of ['Immediate', 'NextBeat', 'NextBar']) {
            rule.validate(validContext, 'test.quantize', q);
        }
        expect(validContext.getErrors()).toHaveLength(0);

        const invalidContext = createStubContext({});
        rule.validate(invalidContext, 'test.quantize', 'NextMeasure');
        expect(invalidContext.getErrors()).toEqual([
            "Invalid quantize value \"NextMeasure\" at \"test.quantize\". Expected 'Immediate', 'NextBeat', 'NextBar', NextGridDivision, or ExactPulse."
        ]);
    });

    it('rejects non-string non-object values including arrays, numbers, and booleans', () => {
        const rule = new QuantizeRule();
        const context = createStubContext({});

        rule.validate(context, 'test.arr', ['NextBeat']);
        rule.validate(context, 'test.num', 123);
        rule.validate(context, 'test.bool', true);

        expect(context.getErrors()).toEqual([
            'Type Error at "test.arr": expected QuantizeType string or object, got array',
            'Type Error at "test.num": expected QuantizeType string or object, got number',
            'Type Error at "test.bool": expected QuantizeType string or object, got boolean'
        ]);
    });

    it('rejects object quantize with missing or non-string type', () => {
        const rule = new QuantizeRule();
        const context = createStubContext({});

        rule.validate(context, 'test.missingType', {});
        rule.validate(context, 'test.badType', { type: 42 });

        expect(context.getErrors()).toEqual([
            'Missing required field at "test.missingType.type"',
            'Type Error at "test.badType.type": expected string, got number'
        ]);
    });

    it('validates NextGridDivision objects including valid, missing/non-string, and invalid divisions', () => {
        const rule = new QuantizeRule();
        const validContext = createStubContext({});

        for (const division of ['1/4', '1/8', '1/16', '1/32']) {
            rule.validate(validContext, 'test.quantize', { type: 'NextGridDivision', division });
        }
        expect(validContext.getErrors()).toHaveLength(0);

        const invalidContext = createStubContext({});
        rule.validate(invalidContext, 'test.missingDiv', { type: 'NextGridDivision' });
        rule.validate(invalidContext, 'test.numDiv', { type: 'NextGridDivision', division: 16 });
        rule.validate(invalidContext, 'test.badDiv', { type: 'NextGridDivision', division: '1/6' });

        expect(invalidContext.getErrors()).toEqual([
            'Missing required field at "test.missingDiv.division"',
            'Type Error at "test.numDiv.division": expected string, got number',
            "Invalid grid division \"1/6\" at \"test.badDiv.division\". Expected '1/4', '1/8', '1/16', or '1/32'."
        ]);
    });

    it('validates ExactPulse objects including 0/positive, missing/non-number, non-finite, and negative offsets', () => {
        const rule = new QuantizeRule();
        const validContext = createStubContext({});

        rule.validate(validContext, 'test.zero', { type: 'ExactPulse', pulseOffset: 0 });
        rule.validate(validContext, 'test.pos', { type: 'ExactPulse', pulseOffset: 480 });
        expect(validContext.getErrors()).toHaveLength(0);

        const invalidContext = createStubContext({});
        rule.validate(invalidContext, 'test.missing', { type: 'ExactPulse' });
        rule.validate(invalidContext, 'test.str', { type: 'ExactPulse', pulseOffset: '480' });
        rule.validate(invalidContext, 'test.nan', { type: 'ExactPulse', pulseOffset: Number.NaN });
        rule.validate(invalidContext, 'test.inf', { type: 'ExactPulse', pulseOffset: Number.POSITIVE_INFINITY });
        rule.validate(invalidContext, 'test.neg', { type: 'ExactPulse', pulseOffset: -1 });

        expect(invalidContext.getErrors()).toEqual([
            'Missing required field at "test.missing.pulseOffset"',
            'Type Error at "test.str.pulseOffset": expected number, got string',
            'Invalid pulseOffset at "test.nan.pulseOffset": must be a finite non-negative number.',
            'Invalid pulseOffset at "test.inf.pulseOffset": must be a finite non-negative number.',
            'Invalid pulseOffset at "test.neg.pulseOffset": must be a finite non-negative number.'
        ]);
    });

    it('rejects unknown object quantize types', () => {
        const rule = new QuantizeRule();
        const context = createStubContext({});

        rule.validate(context, 'test.unknown', { type: 'UnknownMode' });

        expect(context.getErrors()).toEqual([
            'Invalid quantize type "UnknownMode" at "test.unknown.type". Expected \'NextGridDivision\' or \'ExactPulse\'.'
        ]);
    });
});
