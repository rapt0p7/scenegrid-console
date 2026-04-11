import { AudioWorkletNode } from 'standardized-audio-context';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import TinyLimiterNode from '../TinyLimiterNode.js';

vi.mock('standardized-audio-context', () => {
    return {
        AudioWorkletNode: vi.fn().mockImplementation(function (context, name, options) {
            return {
                connect: vi.fn(),
                disconnect: vi.fn(),
                _mockOptions: options
            };
        })
    };
});

vi.mock('../../worklets/lookahead-brickwall-limiter.processor.js', () => ({
    default: 'mock-limiter-url'
}));

describe('TinyLimiterNode', () => {
    let mockContext: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContext = {
            audioWorklet: {
                addModule: vi.fn().mockResolvedValue(undefined)
            }
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Getters (Before Load)', () => {
        it('should throw an error if inputNode is accessed before load()', () => {
            const limiter = new TinyLimiterNode(mockContext);
            expect(() => limiter.inputNode).toThrow('[TinyLimiterNode] Node not loaded yet');
        });

        it('should throw an error if outputNode is accessed before load()', () => {
            const limiter = new TinyLimiterNode(mockContext);
            expect(() => limiter.outputNode).toThrow('[TinyLimiterNode] Node not loaded yet');
        });
    });

    describe('load()', () => {
        it('should load the module, create the node with default options, and return it', async () => {
            const limiter = new TinyLimiterNode(mockContext);

            const node = await limiter.load();

            expect(mockContext.audioWorklet.addModule).toHaveBeenCalledWith('mock-limiter-url');

            expect(AudioWorkletNode).toHaveBeenCalledTimes(1);

            expect(node).toBeDefined();
            expect(limiter.inputNode).toBe(node);
            expect(limiter.outputNode).toBe(node);

            const passedOptions = (node as any)._mockOptions;
            expect(passedOptions).toEqual({
                processorOptions: {
                    lookahead: 0.005,
                    ceiling: 0.99,
                    release: 0.1
                },
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            });
        });

        it('should load the module and pass custom options to the processor', async () => {
            const customOptions = { lookahead: 0.01, ceiling: 0.95, release: 0.2 };
            const limiter = new TinyLimiterNode(mockContext, customOptions);

            const node = await limiter.load();

            const passedOptions = (node as any)._mockOptions;
            expect(passedOptions.processorOptions).toEqual(customOptions);
        });
    });

    describe('dispose()', () => {
        it('should safely do nothing if called before load (node is undefined)', () => {
            const limiter = new TinyLimiterNode(mockContext);
            expect(() => limiter.dispose()).not.toThrow();
        });

        it('should disconnect the node and set it to undefined', async () => {
            const limiter = new TinyLimiterNode(mockContext);
            const node = await limiter.load();

            limiter.dispose();

            expect(node.disconnect).toHaveBeenCalledTimes(1);

            expect(() => limiter.inputNode).toThrow('[TinyLimiterNode] Node not loaded yet');
        });

        it('should silently catch errors if disconnect() fails', async () => {
            const limiter = new TinyLimiterNode(mockContext);
            const node = await limiter.load();

            (node.disconnect as any).mockImplementationOnce(() => {
                throw new Error('Disconnect failed natively');
            });

            expect(() => limiter.dispose()).not.toThrow();

            expect(() => limiter.inputNode).toThrow('[TinyLimiterNode] Node not loaded yet');
        });
    });
});
