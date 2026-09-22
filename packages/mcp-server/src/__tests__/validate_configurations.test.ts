import { describe, it, expect, vi, beforeEach } from 'vitest';

import { validateConfigurations } from '../validate_configurations.js';

describe('validate_configurations', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should return ConsistencyChecker errors for invalid JSON configurations', async () => {
        const invalidPayload = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            banks: { bank_1: { id: 'bank_1', name: 'Bank 1' } },
            buses: {},
            events: {},
            sounds: {},
            snapshots: {}
        };

        const result = await validateConfigurations(invalidPayload);

        expect(result.errors).toBeDefined();
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
