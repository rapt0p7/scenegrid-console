import { describe, it, expect, vi, beforeEach } from 'vitest';

import ListenerManager from '../ListenerManager.js';

import type AutomationEngine from '../../automation/AutomationEngine.js';
import type { AudioCtx as AudioContext__ } from '../../types/IAudioContext.js';
import type { Mocked } from 'vitest';

describe('ListenerManager', () => {
    let mockListener: any;
    let mockContext: AudioContext__;
    let mockAutomation: Mocked<AutomationEngine>;
    let manager: ListenerManager;

    beforeEach(() => {
        mockListener = {
            positionX: { value: 0 },
            positionY: { value: 0 },
            positionZ: { value: 0 },
            forwardX: { value: 0 },
            forwardY: { value: 0 },
            forwardZ: { value: 0 },
            upX: { value: 0 },
            upY: { value: 1 },
            upZ: { value: 0 },
            setPosition: vi.fn(),
            setOrientation: vi.fn()
        };

        mockContext = {
            listener: mockListener
        } as unknown as AudioContext__;

        mockAutomation = {
            ramp: vi.fn()
        } as unknown as Mocked<AutomationEngine>;

        manager = new ListenerManager(mockContext, mockAutomation);
    });

    describe('setPosition', () => {
        it('should use AutomationEngine.ramp with 50ms smoothing for modern API', () => {
            manager.setPosition(10, 20, 30);

            expect(mockAutomation.ramp).toHaveBeenCalledTimes(3);
            expect(mockAutomation.ramp).toHaveBeenNthCalledWith(1, mockListener.positionX, 10, 50);
            expect(mockAutomation.ramp).toHaveBeenNthCalledWith(2, mockListener.positionY, 20, 50);
            expect(mockAutomation.ramp).toHaveBeenNthCalledWith(3, mockListener.positionZ, 30, 50);
            expect(mockListener.setPosition).not.toHaveBeenCalled();
        });

        it('should fallback to synchronous setPosition if AudioParams are not available (Legacy Safari)', () => {
            delete mockListener.positionX;
            delete mockListener.positionY;
            delete mockListener.positionZ;

            manager.setPosition(10, 20, 30);

            expect(mockAutomation.ramp).not.toHaveBeenCalled();
            expect(mockListener.setPosition).toHaveBeenCalledTimes(1);
            expect(mockListener.setPosition).toHaveBeenCalledWith(10, 20, 30);
        });
    });

    describe('setOrientation', () => {
        it('should use AutomationEngine.ramp with 50ms smoothing for modern API', () => {
            manager.setOrientation(0, 0, -1, 0, 1, 0);

            expect(mockAutomation.ramp).toHaveBeenCalledTimes(6);
            expect(mockAutomation.ramp).toHaveBeenCalledWith(mockListener.forwardX, 0, 50);
            expect(mockAutomation.ramp).toHaveBeenCalledWith(mockListener.forwardY, 0, 50);
            expect(mockAutomation.ramp).toHaveBeenCalledWith(mockListener.forwardZ, -1, 50);
            expect(mockAutomation.ramp).toHaveBeenCalledWith(mockListener.upX, 0, 50);
            expect(mockAutomation.ramp).toHaveBeenCalledWith(mockListener.upY, 1, 50);
            expect(mockAutomation.ramp).toHaveBeenCalledWith(mockListener.upZ, 0, 50);
            expect(mockListener.setOrientation).not.toHaveBeenCalled();
        });

        it('should fallback to synchronous setOrientation if AudioParams are not available (Legacy Safari)', () => {
            delete mockListener.forwardX;

            manager.setOrientation(0, 0, -1, 0, 1, 0);

            expect(mockAutomation.ramp).not.toHaveBeenCalled();
            expect(mockListener.setOrientation).toHaveBeenCalledTimes(1);
            expect(mockListener.setOrientation).toHaveBeenCalledWith(0, 0, -1, 0, 1, 0);
        });
    });
});
