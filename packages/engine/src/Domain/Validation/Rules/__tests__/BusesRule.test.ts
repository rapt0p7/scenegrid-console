import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload.js';

import { describe, expect, it, vi } from 'vitest';

import BusesRule from '../BusesRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('BusesRule', () => {
    it('should report an error when no buses are defined in config', () => {
        const rule = new BusesRule();
        const context = createStubContext({ buses: {} });

        rule.validate(context);

        expect(context.getErrors()).toContain('No buses defined in config. At least one bus is required.');
    });

    it('should report an error when a bus routes a send to itself (Lines 38-39)', () => {
        const rule = new BusesRule();
        const context = createStubContext({
            buses: {
                sfx: { sends: { sfx: 0.5 } }
            }
        } as unknown as Partial<IConsistencyCheckerPayload>);

        rule.validate(context);

        expect(context.getErrors()).toContain('Bus "sfx" sends to itself (Feedback Loop!)');
    });

    it('should report an error when a bus sends to an unknown bus', () => {
        const rule = new BusesRule();
        const context = createStubContext({
            buses: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                sfx: { sends: { non_existent_bus: 0.5 } }
            }
        } as unknown as Partial<IConsistencyCheckerPayload>);

        rule.validate(context);

        expect(context.getErrors()).toContain('Bus "sfx" sends to unknown bus "non_existent_bus"');
    });

    it('should assert bus schema with exact path and skip non-object configs (Line 22)', () => {
        const rule = new BusesRule();
        const assertRequiredTypeSpy = vi.fn().mockImplementation((path, val, type) => {
            return typeof val === type && val !== null;
        });
        const assertOptionalTypeSpy = vi.fn().mockReturnValue(true);

        const context = createStubContext({
            buses: {
                invalidBus: 'not_an_object' as any,
                validBus: { gain: 0.8 }
            }
        });
        context.assertRequiredType = assertRequiredTypeSpy;
        context.assertOptionalType = assertOptionalTypeSpy;

        rule.validate(context);

        expect(assertRequiredTypeSpy).toHaveBeenCalledWith('buses.invalidBus', 'not_an_object', 'object');
        expect(assertOptionalTypeSpy).not.toHaveBeenCalledWith(
            'buses.invalidBus.gain',
            expect.anything(),
            expect.anything()
        );
        expect(assertOptionalTypeSpy).toHaveBeenCalledWith('buses.validBus.gain', 0.8, 'number');
    });

    it('should assert exact schema paths for gain, filter, and sends (Lines 24, 27, 28, 32, 34)', () => {
        const rule = new BusesRule();
        const assertOptionalTypeSpy = vi.fn().mockReturnValue(true);
        const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);

        const filterObj = { type: 'lowpass' };
        const sendsObj = { reverb: 0.3 };
        const context = createStubContext({
            buses: {
                music: {
                    gain: 1.0,
                    filter: filterObj,
                    sends: sendsObj
                },
                reverb: {}
            }
        } as unknown as Partial<IConsistencyCheckerPayload>);
        context.assertOptionalType = assertOptionalTypeSpy;
        context.assertRequiredType = assertRequiredTypeSpy;

        rule.validate(context);

        expect(assertOptionalTypeSpy).toHaveBeenCalledWith('buses.music.gain', 1.0, 'number');
        expect(assertOptionalTypeSpy).toHaveBeenCalledWith('buses.music.filter', filterObj, 'object');
        expect(assertRequiredTypeSpy).toHaveBeenCalledWith('buses.music.filter.type', 'lowpass', 'string');
        expect(assertOptionalTypeSpy).toHaveBeenCalledWith('buses.music.sends', sendsObj, 'object');
        expect(assertOptionalTypeSpy).toHaveBeenCalledWith('buses.music.sends.reverb', 0.3, 'number');
    });

    it('should only validate sidechain.enabled when explicitly defined (Line 46)', () => {
        const rule = new BusesRule();
        const assertOptionalTypeSpy = vi.fn().mockReturnValue(true);

        const context = createStubContext({
            buses: {
                busWithoutEnabled: { sidechain: { target: 'master' } as any },
                busWithEnabled: { sidechain: { enabled: true } }
            }
        });
        context.assertOptionalType = assertOptionalTypeSpy;

        rule.validate(context);

        expect(assertOptionalTypeSpy).not.toHaveBeenCalledWith(
            'buses.busWithoutEnabled.sidechain.enabled',
            expect.anything(),
            expect.anything()
        );
        expect(assertOptionalTypeSpy).toHaveBeenCalledWith('buses.busWithEnabled.sidechain.enabled', true, 'boolean');
    });
});
