// oxlint-disable unicorn/no-useless-undefined typescript/no-confusing-void-expression
import { describe, expect, it, vi } from 'vitest';

import { RTPCRule } from '../RTPCRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('RTPCRule', () => {
    describe('validate', () => {
        it('should return cleanly when rtpcMap is absent', () => {
            const rule = new RTPCRule();
            const context = createStubContext({});

            expect(() => rule.validate(context, 'sound', undefined)).not.toThrow();
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should accept all 4 valid curve preset types without errors (Line 18)', () => {
            const rule = new RTPCRule();
            const context = createStubContext({ buses: undefined });
            const curveTypes = ['linear', 'logarithmic', 'exponential', 's-curve'] as const;

            for (const type of curveTypes) {
                const rtpcMap = {
                    gain: {
                        gameParam: 'volume_param',
                        curve: { type, minX: 0, maxX: 1, minY: 0, maxY: 1 }
                    }
                };

                rule.validate(context, 'sound', rtpcMap as any);
            }

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should report error and skip processing when RTPC target is unknown (Lines 26-28)', () => {
            const rule = new RTPCRule();
            const context = createStubContext({});

            const rtpcMap = {
                unsupportedTarget: {
                    gameParam: 123 as any
                }
            };

            rule.validate(context, 'sound', rtpcMap as any);

            expect(context.getErrors()).toEqual([
                'sound.rtpc.unsupportedTarget uses unknown RTPC target "unsupportedTarget".'
            ]);
        });

        it('should assert required string for gameParam with exact path and skip curve validation if invalid (Line 33)', () => {
            const rule = new RTPCRule();
            const context = createStubContext({});

            const rtpcMap = {
                gain: {
                    gameParam: 999 as any,
                    curve: undefined as any
                }
            };

            rule.validate(context, 'sound', rtpcMap);

            expect(context.getErrors()).toContain(
                'Type Error at "sound.rtpc.gain.gameParam": expected string, got number'
            );
            expect(context.getErrors().filter(e => e.includes('curve'))).toHaveLength(0);
        });

        it('should only assert smoothing schema path when explicitly defined (Line 35)', () => {
            const rule = new RTPCRule();
            const context = createStubContext({});
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            const rtpcWithoutSmoothing = {
                gain: { gameParam: 'p1', curve: { type: 'linear', minX: 0, maxX: 1, minY: 0, maxY: 1 } }
            };
            const rtpcWithSmoothing = {
                gain: {
                    gameParam: 'p1',
                    smoothing: 0.25,
                    curve: { type: 'linear', minX: 0, maxX: 1, minY: 0, maxY: 1 }
                }
            };

            rule.validate(context, 's1', rtpcWithoutSmoothing as any);
            rule.validate(context, 's2', rtpcWithSmoothing as any);

            expect(assertOptionalTypeSpy).not.toHaveBeenCalledWith(
                's1.rtpc.gain.smoothing',
                expect.anything(),
                expect.anything()
            );
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('s2.rtpc.gain.smoothing', 0.25, 'number');
        });

        it('should accept valid 2-point array curves and assert point schema paths (Lines 43-48)', () => {
            const rule = new RTPCRule();
            const context = createStubContext({});
            const assertRequiredTypeSpy = vi.spyOn(context, 'assertRequiredType');

            const rtpcMap = {
                gain: {
                    gameParam: 'param_speed',
                    curve: [
                        { x: 0, y: 0 },
                        { x: 100, y: 1 }
                    ]
                }
            };

            rule.validate(context, 'vehicle', rtpcMap as any);

            expect(context.getErrors()).toHaveLength(0);
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith('vehicle.rtpc.gain.curve[0].x', 0, 'number');
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith('vehicle.rtpc.gain.curve[0].y', 0, 'number');
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith('vehicle.rtpc.gain.curve[1].x', 100, 'number');
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith('vehicle.rtpc.gain.curve[1].y', 1, 'number');
        });

        it('should reject 1-point array curves and safely handle null points (Lines 43, 47, 48)', () => {
            const rule = new RTPCRule();
            const context = createStubContext({});

            const rtpcSinglePoint = {
                gain: { gameParam: 'p1', curve: [{ x: 0, y: 0 }] }
            };
            const rtpcNullPoint = {
                gain: { gameParam: 'p1', curve: [{ x: 0, y: 0 }, null as any] }
            };

            rule.validate(context, 's1', rtpcSinglePoint as any);
            rule.validate(context, 's2', rtpcNullPoint as any);

            expect(context.getErrors()).toContain('s1.rtpc.gain.curve has invalid curve (needs >= 2 points).');
            expect(context.getErrors()).toContain('Missing required field at "s2.rtpc.gain.curve[1].x"');
        });

        it('should assert exact schema paths for preset curve minY and maxY (Lines 62-63)', () => {
            const rule = new RTPCRule();
            const context = createStubContext({});
            const assertRequiredTypeSpy = vi.spyOn(context, 'assertRequiredType');

            const rtpcMap = {
                gain: {
                    gameParam: 'param_rpm',
                    curve: { type: 'linear', minX: 0, maxX: 1000, minY: 0.1, maxY: 0.9 }
                }
            };

            rule.validate(context, 'engine', rtpcMap as any);

            expect(assertRequiredTypeSpy).toHaveBeenCalledWith('engine.rtpc.gain.curve.minY', 0.1, 'number');
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith('engine.rtpc.gain.curve.maxY', 0.9, 'number');
        });

        it('should reject malformed objects without a type field as invalid preset curves (Line 51)', () => {
            const rule = new RTPCRule();
            const context = createStubContext({});

            const rtpcMap = {
                gain: {
                    gameParam: 'param_rpm',
                    curve: { invalidProp: true } as any
                }
            };

            rule.validate(context, 'engine', rtpcMap as any);

            expect(context.getErrors()).toContain(
                'Type Error at "engine.rtpc.gain.curve": expected array or valid preset object'
            );
        });

        it('should pass when sendLevel references an existing bus and error when missing or unknown (Lines 69-72)', () => {
            const rule = new RTPCRule();
            const context = createStubContext({
                buses: { reverb_aux: {} }
            });

            const rtpcValidSend = {
                sendLevel: {
                    gameParam: 'aux_send',
                    sendTargetBus: 'reverb_aux',
                    curve: { type: 'linear', minX: 0, maxX: 1, minY: 0, maxY: 1 }
                }
            };

            const rtpcMissingSendBus = {
                sendLevel: {
                    gameParam: 'aux_send',
                    curve: { type: 'linear', minX: 0, maxX: 1, minY: 0, maxY: 1 }
                }
            };

            const rtpcUnknownSendBus = {
                sendLevel: {
                    gameParam: 'aux_send',
                    sendTargetBus: 'ghost_bus',
                    curve: { type: 'linear', minX: 0, maxX: 1, minY: 0, maxY: 1 }
                }
            };

            rule.validate(context, 's1', rtpcValidSend as any);
            rule.validate(context, 's2', rtpcMissingSendBus as any);
            rule.validate(context, 's3', rtpcUnknownSendBus as any);

            expect(context.getErrors()).toContain("s2.rtpc.sendLevel is missing 'sendTargetBus'.");
            expect(context.getErrors()).toContain('s3.rtpc.sendLevel references unknown bus "ghost_bus".');
            expect(context.getErrors().filter(e => e.startsWith('s1'))).toHaveLength(0);
        });

        it('should reject sendTargetBus when target property is not sendLevel', () => {
            const rule = new RTPCRule();
            const context = createStubContext({});

            const rtpcMap = {
                gain: {
                    gameParam: 'p1',
                    sendTargetBus: 'reverb',
                    curve: { type: 'linear', minX: 0, maxX: 1, minY: 0, maxY: 1 }
                }
            };

            rule.validate(context, 'sound', rtpcMap as any);

            expect(context.getErrors()).toContain(
                "sound.rtpc.gain specifies 'sendTargetBus', but target property is not 'sendLevel'."
            );
        });
    });
});
