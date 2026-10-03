import { describe, it, expect, vi, beforeEach, afterEach, Mocked } from 'vitest';

import AudioDebugger from '../AudioDebugger.js';

vi.mock('../visualizers.js', () => ({
    createFrequencyCurveWithRMS: vi.fn().mockResolvedValue(undefined),
    createMeters: vi.fn().mockResolvedValue(undefined)
}));

import { IWorkletLoader } from '../types/IWorkletLoader.js';
import { createFrequencyCurveWithRMS, createMeters } from '../visualizers.js';

describe('AudioDebugger', () => {
    let mockContext: any;
    let mockBusSystem: any;
    let mockMasterNode: any;
    let wrapperElement: HTMLElement;
    let mockWorkletLoader: Mocked<IWorkletLoader>;

    beforeEach(() => {
        vi.clearAllMocks();

        wrapperElement = document.createElement('div');
        wrapperElement.id = 'wrapper';
        document.body.append(wrapperElement);

        mockContext = {
            sampleRate: 44_100
        };

        mockWorkletLoader = {
            loadModule: vi.fn()
        };

        const createMockGainNode = () => ({
            connect: vi.fn().mockReturnThis(),
            disconnect: vi.fn().mockReturnThis(),
            context: mockContext,
            gain: { value: 1, setValueAtTime: vi.fn() }
        });

        mockMasterNode = createMockGainNode();

        const mockSfxBus = {
            id: 'sfx_bus',
            analyzerTapNode: createMockGainNode(),
            postFilterGain: createMockGainNode(),
            inputNode: createMockGainNode(),
            setGainImmediate: vi.fn(),
            setLogicalGain: vi.fn(),
            safeReplaceFilter: vi.fn(),
            bindRTPC: vi.fn(),

            logicalTargetGain: 1,
            volumes: { rms: [0.5, 0.5], peak: [0.7, 0.7] }
        };

        mockBusSystem = {
            getAllBuses: vi.fn().mockReturnValue(new Map([['sfx_bus', mockSfxBus]]))
        };

        vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
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
        const debuggerInstance = new AudioDebugger(mockBusSystem, mockMasterNode);

        void debuggerInstance.init({ wrapperSelector: '#non_existent', workletLoader: mockWorkletLoader });

        expect(warnSpy).toHaveBeenCalledWith('[AudioDebugger] Wrapper element "#non_existent" not found.');
        expect(mockBusSystem.getAllBuses).not.toHaveBeenCalled();

        warnSpy.mockRestore();
    });

    it('should create DOM structure for Master and all active buses', () => {
        const debuggerInstance = new AudioDebugger(mockBusSystem, mockMasterNode);

        void debuggerInstance.init({ wrapperSelector: '#wrapper', workletLoader: mockWorkletLoader });

        const columns = wrapperElement.querySelectorAll('.bus-column');
        expect(columns.length).toBe(2);

        const titles = Array.from(wrapperElement.querySelectorAll('.bus-title')).map(element => element.textContent);
        expect(titles).toContain('Master');
        expect(titles).toContain('sfx_bus');

        expect(wrapperElement.querySelectorAll('.spectrum-box').length).toBe(2);
        expect(wrapperElement.querySelectorAll('.meter-box').length).toBe(2);
    });

    it('should initialize custom visualizers with exact widths', async () => {
        const debuggerInstance = new AudioDebugger(mockBusSystem, mockMasterNode);

        void debuggerInstance.init({ wrapperSelector: '#wrapper', workletLoader: mockWorkletLoader });

        await new Promise(r => setTimeout(r, 0));

        expect(createFrequencyCurveWithRMS).toHaveBeenCalledTimes(2);
        expect(createMeters).toHaveBeenCalledTimes(2);

        const expectedWidth = 496;

        expect(createFrequencyCurveWithRMS).toHaveBeenCalledWith(
            expect.any(HTMLDivElement),
            mockMasterNode,
            mockWorkletLoader,
            expectedWidth
        );
        expect(createMeters).toHaveBeenCalledWith(
            expect.any(HTMLDivElement),
            mockMasterNode,
            mockWorkletLoader,
            expectedWidth
        );
    });

    it('should use default wrapper selector if not provided and clear innerHTML exactly', async () => {
        wrapperElement.innerHTML = '<span>Old Content</span>';

        const debuggerInstance = new AudioDebugger(mockBusSystem, mockMasterNode);
        void debuggerInstance.init({ workletLoader: mockWorkletLoader });

        await new Promise(r => setTimeout(r, 0));

        const columns = wrapperElement.querySelectorAll('.bus-column');
        expect(columns.length).toBe(2);

        expect(wrapperElement.childNodes.length).toBe(2);
        expect(wrapperElement.innerHTML).not.toContain('Old Content');
        expect(wrapperElement.innerHTML).not.toContain('Stryker was here');
    });

    it('should gracefully handle buses with missing postFilterGain nodes', async () => {
        mockBusSystem.getAllBuses.mockReturnValue(new Map([['broken_bus', { postFilterGain: null }]]));

        const debuggerInstance = new AudioDebugger(mockBusSystem, mockMasterNode);

        void debuggerInstance.init({ wrapperSelector: '#wrapper', workletLoader: mockWorkletLoader });

        await new Promise(r => setTimeout(r, 0));

        const columns = wrapperElement.querySelectorAll('.bus-column');
        expect(columns.length).toBe(1);
        expect(wrapperElement.querySelector('.bus-title')?.textContent).toBe('Master');

        expect(createFrequencyCurveWithRMS).toHaveBeenCalledTimes(1);
        expect(createMeters).toHaveBeenCalledTimes(1);
    });
});
