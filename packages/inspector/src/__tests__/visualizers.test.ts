// oxlint-disable unicorn/no-useless-undefined
/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D

import { describe, it, expect, vi, beforeEach, afterEach, Mocked } from 'vitest';

import type { IWorkletLoader } from '../types/IWorkletLoader.js';

import { createFrequencyBarsWithRMS, createMeters, createFrequencyCurveWithRMS } from '../visualizers.js';

vi.mock('../worklets/meter.processor.js?worklet', () => ({
    default: 'mocked-processor-url'
}));

vi.mock('standardized-audio-context', () => {
    return {
        AudioWorkletNode: vi.fn().mockImplementation(function () {
            return {
                port: {
                    onmessage: null
                }
            };
        })
    };
});

describe('Visualizers (Smoke Tests)', () => {
    let mockContext: any;
    let mockGainNode: any;
    let container: HTMLElement;
    let mockWorkletLoader: Mocked<IWorkletLoader>;
    let rafCount = 0;

    beforeEach(() => {
        vi.clearAllMocks();
        rafCount = 0;

        container = document.createElement('div');

        mockWorkletLoader = {
            loadModule: vi.fn()
        };

        mockContext = {
            sampleRate: 44_100,
            audioWorklet: {
                addModule: vi.fn().mockResolvedValue(undefined)
            },
            createAnalyser: vi.fn().mockReturnValue({
                fftSize: 2048,
                minDecibels: -100,
                maxDecibels: -10,
                smoothingTimeConstant: 0.8,
                frequencyBinCount: 1024,
                getFloatFrequencyData: vi.fn((array: Float32Array) => {
                    // eslint-disable-next-line no-param-reassign
                    for (let index = 0; index < array.length; index++) array[index] = -50;
                })
            })
        };

        mockGainNode = {
            context: mockContext,
            connect: vi.fn()
        };

        vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            if (rafCount < 1) {
                rafCount++;
                callback(performance.now());
            }
            return 1;
        });

        HTMLCanvasElement.prototype.getContext = vi.fn((contextType: string) => {
            if (contextType === 'webgl') {
                // oxlint-disable-next-line typescript/no-unsafe-return
                return {
                    VERTEX_SHADER: 35_633,
                    FRAGMENT_SHADER: 35_632,
                    COMPILE_STATUS: 35_713,
                    LINK_STATUS: 35_714,
                    ARRAY_BUFFER: 34_962,
                    STATIC_DRAW: 35_044,
                    DYNAMIC_DRAW: 35_048,
                    FLOAT: 5126,
                    TRIANGLE_STRIP: 5,
                    LINES: 1,
                    LINE_STRIP: 3,
                    COLOR_BUFFER_BIT: 16_384,
                    createShader: vi.fn().mockReturnValue({}),
                    shaderSource: vi.fn(),
                    compileShader: vi.fn(),
                    getShaderParameter: vi.fn().mockReturnValue(true),
                    createProgram: vi.fn().mockReturnValue({}),
                    attachShader: vi.fn(),
                    linkProgram: vi.fn(),
                    getProgramParameter: vi.fn().mockReturnValue(true),
                    getAttribLocation: vi.fn().mockReturnValue(1),
                    getUniformLocation: vi.fn().mockReturnValue({}),
                    createBuffer: vi.fn().mockReturnValue({}),
                    bindBuffer: vi.fn(),
                    bufferData: vi.fn(),
                    enableVertexAttribArray: vi.fn(),
                    vertexAttribPointer: vi.fn(),
                    uniform4fv: vi.fn(),
                    drawArrays: vi.fn(),
                    viewport: vi.fn(),
                    clearColor: vi.fn(),
                    clear: vi.fn(),
                    useProgram: vi.fn(),
                    uniformMatrix4fv: vi.fn(),
                    lineWidth: vi.fn(),
                    uniform1f: vi.fn(),
                    uniform1i: vi.fn()
                } as any;
            }
            if (contextType === '2d') {
                return {
                    clearRect: vi.fn(),
                    fillText: vi.fn(),
                    fillRect: vi.fn(),
                    measureText: vi.fn().mockReturnValue({ width: 10 })
                } as any;
            }
            return null;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('createFrequencyBarsWithRMS', () => {
        it('should initialize AudioWorklet, WebGL and run a render frame without crashing', async () => {
            await createFrequencyBarsWithRMS(container, mockGainNode, mockWorkletLoader, 800, 600);

            expect(mockWorkletLoader.loadModule).toHaveBeenCalledWith(mockContext, 'mocked-processor-url');
            expect(mockGainNode.connect).toHaveBeenCalledTimes(2);

            const canvas = container.querySelector('canvas');
            expect(canvas).not.toBeNull();
            expect(canvas?.width).toBe(800);

            expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
        });

        it('should abort gracefully if WebGL is not supported', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);

            await createFrequencyBarsWithRMS(container, mockGainNode, mockWorkletLoader, 800, 600);

            expect(consoleSpy).toHaveBeenCalledWith('WebGL not supported');
            consoleSpy.mockRestore();
        });
    });

    describe('createMeters', () => {
        it('should create WebGL and 2D canvases, bind messages, and render without crashing', async () => {
            await createMeters(container, mockGainNode, mockWorkletLoader, 450, 150);

            expect(mockWorkletLoader.loadModule).toHaveBeenCalled();

            const canvases = container.querySelectorAll('canvas');
            expect(canvases.length).toBe(2);

            expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
        });

        it('should abort gracefully if contexts are missing', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);

            await createMeters(container, mockGainNode, mockWorkletLoader, 450, 150);

            expect(consoleSpy).toHaveBeenCalledWith('WebGL or Canvas 2D not supported');
            consoleSpy.mockRestore();
        });
    });

    describe('createFrequencyCurveWithRMS', () => {
        it('should initialize and run render frame for curve without crashing', async () => {
            await createFrequencyCurveWithRMS(container, mockGainNode, mockWorkletLoader, 600, 200);

            expect(mockWorkletLoader.loadModule).toHaveBeenCalled();

            const canvas = container.querySelector('canvas');
            expect(canvas).not.toBeNull();

            const { AudioWorkletNode } = await import('standardized-audio-context');
            const mockNode = (AudioWorkletNode as any).mock.results[0].value;

            expect(mockNode.port.onmessage).toBeDefined();
            mockNode.port.onmessage({ data: { rms: 0.5, peak: 0.8, lufs: -14 } });

            expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
        });
    });
});
