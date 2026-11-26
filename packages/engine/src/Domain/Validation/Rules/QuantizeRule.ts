// noinspection D

import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';

import { isAbsent } from '@scene-grid/shared';

const VALID_STRING_QUANTIZES = new Set(['Immediate', 'NextBeat', 'NextBar']);
const VALID_GRID_DIVISIONS = new Set(['1/4', '1/8', '1/16', '1/32']);

export default class QuantizeRule {
    public validate(
        context: IValidationContext,
        path: string,
        quantize: unknown,
        options: { required: boolean } = { required: true }
    ): void {
        if (isAbsent(quantize)) {
            if (options.required) {
                context.addError(`Missing required field at "${path}"`);
            }
            return;
        }

        if (typeof quantize === 'string') {
            if (!VALID_STRING_QUANTIZES.has(quantize)) {
                context.addError(
                    `Invalid quantize value "${quantize}" at "${path}". Expected 'Immediate', 'NextBeat', 'NextBar', NextGridDivision, or ExactPulse.`
                );
            }
            return;
        }

        if (typeof quantize === 'object' && !Array.isArray(quantize)) {
            this.validateObject(context, path, quantize as Record<string, unknown>);
            return;
        }

        const actualType = Array.isArray(quantize) ? 'array' : typeof quantize;
        context.addError(`Type Error at "${path}": expected QuantizeType string or object, got ${actualType}`);
    }

    private validateObject(context: IValidationContext, path: string, qObj: Record<string, unknown>): void {
        if (!context.assertRequiredType(`${path}.type`, qObj.type, 'string')) return;

        const quantizeType = qObj.type as string;

        if (quantizeType === 'NextGridDivision') {
            if (context.assertRequiredType(`${path}.division`, qObj.division, 'string')) {
                const division = qObj.division as string;
                if (!VALID_GRID_DIVISIONS.has(division)) {
                    context.addError(
                        `Invalid grid division "${division}" at "${path}.division". Expected '1/4', '1/8', '1/16', or '1/32'.`
                    );
                }
            }
            return;
        }

        if (quantizeType === 'ExactPulse') {
            if (context.assertRequiredType(`${path}.pulseOffset`, qObj.pulseOffset, 'number')) {
                const pulseOffset = qObj.pulseOffset as number;
                if (!Number.isFinite(pulseOffset) || pulseOffset < 0) {
                    context.addError(
                        `Invalid pulseOffset at "${path}.pulseOffset": must be a finite non-negative number.`
                    );
                }
            }
            return;
        }

        context.addError(
            `Invalid quantize type "${quantizeType}" at "${path}.type". Expected 'NextGridDivision' or 'ExactPulse'.`
        );
    }
}
