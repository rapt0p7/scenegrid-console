import { describe, it, expect, vi, beforeEach } from 'vitest';

import { InstanceRTPCBinder } from '../InstanceRTPCBinder.js';

import type { IRTPCManager, IRTPCConfig, RTPCTargetProperty } from '../../../interfaces/IRTPCManager.js';
import type { ISoundInstance } from '@infrastructure';

describe('InstanceRTPCBinder', () => {
    let mockInstance: any;
    let mockRtpcManager: any;
    let mockEmitter: any;

    let instanceEventHandlers: Record<string, (...arguments_: any[]) => any> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        instanceEventHandlers = {};

        mockEmitter = {
            on: vi.fn(),
            off: vi.fn()
        };

        mockRtpcManager = {
            events: mockEmitter,
            getValue: vi.fn().mockReturnValue(0)
        };

        mockInstance = {
            automate: vi.fn(),
            on: vi.fn().mockImplementation((event: string, handler: (...arguments_: any[]) => any) => {
                instanceEventHandlers[event] = handler;
                return () => delete instanceEventHandlers[event];
            }),
            off: vi.fn()
        };
    });

    it('should bind RTPC config to instance and apply initial values', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            gain: {
                gameParam: 'car_speed',
                curve: [
                    { x: 0, y: 0.5 },
                    { x: 100, y: 1 }
                ],
                smoothingMs: 100
            }
        };

        mockRtpcManager.getValue.mockReturnValue(50);

        InstanceRTPCBinder.bind(mockInstance as ISoundInstance, configs, mockRtpcManager as IRTPCManager);

        expect(mockEmitter.on).toHaveBeenCalledWith('car_speed', expect.any(Function));

        expect(mockInstance.automate).toHaveBeenCalledWith('gain', 0.75, 100);
    });

    it('should ignore unsupported targets like sendLevel', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            sendLevel: {
                gameParam: 'reverb_amount',
                curve: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 }
                ]
            }
        };

        InstanceRTPCBinder.bind(mockInstance as ISoundInstance, configs, mockRtpcManager as IRTPCManager);

        expect(mockEmitter.on).not.toHaveBeenCalled();
        expect(mockInstance.automate).not.toHaveBeenCalled();
    });

    it('should clean up RTPC subscriptions when instance is ended, stopped or disposed', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            pitch: {
                gameParam: 'engine_rpm',
                curve: [
                    { x: 1000, y: 1 },
                    { x: 8000, y: 2 }
                ]
            }
        };

        InstanceRTPCBinder.bind(mockInstance as ISoundInstance, configs, mockRtpcManager as IRTPCManager);

        expect(mockEmitter.on).toHaveBeenCalledWith('engine_rpm', expect.any(Function));

        expect(instanceEventHandlers['stopped']).toBeDefined();
        instanceEventHandlers['stopped']();

        expect(mockEmitter.off).toHaveBeenCalledWith('engine_rpm', expect.any(Function));

        expect(instanceEventHandlers['stopped']).toBeUndefined();
    });

    it('should prevent reacting to RTPC events after cleanup (Race Condition prevention)', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            filterFrequency: {
                gameParam: 'underwater',
                curve: [
                    { x: 0, y: 22_000 },
                    { x: 1, y: 500 }
                ]
            }
        };

        InstanceRTPCBinder.bind(mockInstance as ISoundInstance, configs, mockRtpcManager as IRTPCManager);

        const rtpcHandler = mockEmitter.on.mock.calls[0][1];

        instanceEventHandlers['ended']();

        mockInstance.automate.mockClear();

        rtpcHandler(1);

        expect(mockInstance.automate).not.toHaveBeenCalled();
    });

    it('should support preset curve configurations (MathCurvePresetDef)', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            gain: {
                gameParam: 'car_speed',
                curve: {
                    type: 'exponential',
                    minX: 0,
                    maxX: 100,
                    minY: 0,
                    maxY: 1
                },
                smoothingMs: 150
            }
        };

        mockRtpcManager.getValue.mockReturnValue(50);

        InstanceRTPCBinder.bind(mockInstance as ISoundInstance, configs, mockRtpcManager as IRTPCManager);

        expect(mockEmitter.on).toHaveBeenCalledWith('car_speed', expect.any(Function));

        expect(mockInstance.automate).toHaveBeenCalledWith('gain', 0.25, 150);
    });
});
