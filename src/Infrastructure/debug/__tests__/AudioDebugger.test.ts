import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// eslint-disable-next-line import/order
import AudioDebugger from '../AudioDebugger.js';

vi.mock('../../../helpers/visualizers.js', () => ({
    createFrequencyCurveWithRMS: vi.fn().mockResolvedValue(undefined),
    createMeters: vi.fn().mockResolvedValue(undefined)
}));

// eslint-disable-next-line import/order
import { createFrequencyCurveWithRMS, createMeters } from '../../../helpers/visualizers.js';

describe('AudioDebugger', () => {
    let mockContext: any;
    let mockBusSystem: any;
    let mockMasterNode: any;
    let wrapperElement: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();

        wrapperElement = document.createElement('div');
        wrapperElement.id = 'wrapper';
        document.body.append(wrapperElement);

        mockContext = {};
        mockMasterNode = { connect: vi.fn() };

        const mockBuses = new Map([['sfx_bus', { postFilterGain: { connect: vi.fn() } }]]);

        mockBusSystem = {
            getAllBuses: vi.fn().mockReturnValue(mockBuses)
        };

        vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            callback(performance.now());
            return 1;
        });

        Object.defineProperty(globalThis, 'screen', {
            value: { availWidth: 1000 },
            writable: true
        });
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('should safely return and warn if wrapper selector is not found', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const debuggerInstance = new AudioDebugger(mockContext, mockBusSystem, mockMasterNode);

        debuggerInstance.init({ wrapperSelector: '#non_existent' });

        expect(warnSpy).toHaveBeenCalledWith('[AudioDebugger] Wrapper element "#non_existent" not found.');
        expect(mockBusSystem.getAllBuses).not.toHaveBeenCalled();

        warnSpy.mockRestore();
    });

    it('should create DOM structure for Master and all active buses', () => {
        const debuggerInstance = new AudioDebugger(mockContext, mockBusSystem, mockMasterNode);

        debuggerInstance.init({ wrapperSelector: '#wrapper' });

        const columns = wrapperElement.querySelectorAll('.bus-column');
        expect(columns.length).toBe(2);

        // eslint-disable-next-line unicorn/prefer-spread
        const titles = Array.from(wrapperElement.querySelectorAll('.bus-title')).map(element => element.textContent);
        expect(titles).toContain('Master');
        expect(titles).toContain('sfx_bus');

        expect(wrapperElement.querySelectorAll('.spectrum-box').length).toBe(2);
        expect(wrapperElement.querySelectorAll('.meter-box').length).toBe(2);
    });

    it('should initialize custom visualizers', async () => {
        const debuggerInstance = new AudioDebugger(mockContext, mockBusSystem, mockMasterNode);

        debuggerInstance.init({ wrapperSelector: '#wrapper' });

        await new Promise(r => setTimeout(r, 0));

        expect(createFrequencyCurveWithRMS).toHaveBeenCalledTimes(2);
        expect(createMeters).toHaveBeenCalledTimes(2);
    });

    it('should gracefully handle buses with missing postFilterGain nodes', async () => {
        mockBusSystem.getAllBuses.mockReturnValue(new Map([['broken_bus', { postFilterGain: null }]]));

        const debuggerInstance = new AudioDebugger(mockContext, mockBusSystem, mockMasterNode);

        debuggerInstance.init({ wrapperSelector: '#wrapper' });

        await new Promise(r => setTimeout(r, 0));

        const columns = wrapperElement.querySelectorAll('.bus-column');
        expect(columns.length).toBe(1);
        expect(wrapperElement.querySelector('.bus-title')?.textContent).toBe('Master');

        expect(createFrequencyCurveWithRMS).toHaveBeenCalledTimes(1);
        expect(createMeters).toHaveBeenCalledTimes(1);
    });
});
