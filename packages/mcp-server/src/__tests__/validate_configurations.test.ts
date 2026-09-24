import { describe, it, expect, vi } from 'vitest';

import { validateConfigurations } from '../validate_configurations.js';

vi.mock('@scene-grid/engine', () => ({
    ConsistencyChecker: {
        validate: vi.fn().mockReturnValue([true, { errors: [], warnings: ['warn_1'] }])
    }
}));

import { ConsistencyChecker } from '@scene-grid/engine';

describe('validate_configurations', () => {
    it('returns errors from ConsistencyChecker for an invalid payload', async () => {
        (ConsistencyChecker.validate as ReturnType<typeof vi.fn>).mockReturnValueOnce([
            false,
            { errors: ['missing buses'], warnings: [] }
        ]);

        const result = await validateConfigurations({});

        expect(result.errors).toEqual(['missing buses']);
        expect(result.warnings).toEqual([]);
    });

    it('returns warnings from ConsistencyChecker when present', async () => {
        (ConsistencyChecker.validate as ReturnType<typeof vi.fn>).mockReturnValueOnce([
            true,
            { errors: [], warnings: ['deprecated field'] }
        ]);

        const result = await validateConfigurations({});

        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual(['deprecated field']);
    });

    it('defaults errors and warnings to empty arrays when the report omits them', async () => {
        (ConsistencyChecker.validate as ReturnType<typeof vi.fn>).mockReturnValueOnce([true, {}]);

        const result = await validateConfigurations({});

        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
    });
});
