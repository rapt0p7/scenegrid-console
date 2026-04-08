import { describe, it, expect, vi, beforeEach } from 'vitest';

import { NodeChain } from '../NodeChain.js';

import type { AudioNodeFactory } from '@infrastructure';

describe('NodeChain', () => {
    let mockFactory: any;
    let createdNodes: any[];

    beforeEach(() => {
        vi.clearAllMocks();
        createdNodes = [];

        const mockPanner = {
            connect: vi.fn(),
            disconnect: vi.fn(),
            positionX: { value: 0 },
            positionY: { value: 0 },
            positionZ: { value: 0 },
            setPosition: vi.fn()
        };

        mockFactory = {
            createGain: vi.fn().mockImplementation(value => {
                return { type: 'gain', connect: vi.fn(), disconnect: vi.fn() };
            }),
            createFilter: vi.fn().mockImplementation(() => {
                const node = { type: 'filter', connect: vi.fn(), disconnect: vi.fn() };
                createdNodes.push(node);
                return node;
            }),
            createStereoPanner: vi.fn().mockImplementation(() => {
                return { type: 'panner', connect: vi.fn(), disconnect: vi.fn() };
            }),
            create3DPanner: vi.fn().mockReturnValue(mockPanner)
        } as unknown as AudioNodeFactory;
    });

    it('should initialize with filters and connect them sequentially', () => {
        const chain = new NodeChain(mockFactory, {
            initialFilters: [
                { type: 'lowpass', frequency: 1000 },
                { type: 'highpass', frequency: 500 }
            ]
        });

        expect(chain.inputNode.connect).toHaveBeenCalledWith(createdNodes[0]);
        expect(createdNodes[0].connect).toHaveBeenCalledWith(createdNodes[1]);
        expect(createdNodes[1].connect).toHaveBeenCalledWith(chain.outputNode);
    });

    it('should disconnect old filters and rebuild graph when setFilters is called', () => {
        const chain = new NodeChain(mockFactory, {
            initialFilters: [{ type: 'lowpass', frequency: 1000 }]
        });

        const oldFilter = createdNodes[0];

        chain.setFilters([{ type: 'bandpass', frequency: 2000 }]);
        const newFilter = createdNodes[1];

        expect(oldFilter.disconnect).toHaveBeenCalled();

        expect(chain.inputNode.connect).toHaveBeenCalledWith(newFilter);
        expect(newFilter.connect).toHaveBeenCalledWith(chain.outputNode);
    });

    describe('Panner Configuration', () => {
        it('should build graph WITH 3D PannerNode if spatial option is provided', () => {
            const chain = new NodeChain(mockFactory, { spatial: true });
            expect(mockFactory.create3DPanner).toHaveBeenCalledWith(true);
            expect(chain.pannerNode).toBeDefined();
            expect(mockFactory.createStereoPanner).not.toHaveBeenCalled();
        });

        it('should build graph WITH StereoPannerNode if hasPanner is true and spatial is undefined', () => {
            const chain = new NodeChain(mockFactory, { hasPanner: true });
            expect(mockFactory.createStereoPanner).toHaveBeenCalled();
            expect(mockFactory.create3DPanner).not.toHaveBeenCalled();
        });
    });

    it('should correctly return mainFilterNode or null if empty', () => {
        const chainWithoutFilters = new NodeChain(mockFactory);
        expect(chainWithoutFilters.mainFilterNode).toBeNull();

        const chainWithFilters = new NodeChain(mockFactory, {
            initialFilters: [{ type: 'lowpass', frequency: 1000 }]
        });
        expect(chainWithFilters.mainFilterNode).toBe(createdNodes[0]);
    });

    describe('External Connections', () => {
        it('should connect outputNode to destination and store it', () => {
            const chain = new NodeChain(mockFactory);
            const mockDestination = { connect: vi.fn(), disconnect: vi.fn() };

            chain.connectTo(mockDestination as any);
            expect(chain.outputNode.connect).toHaveBeenCalledWith(mockDestination);
        });

        it('should disconnect from previous destination when connecting to a new one', () => {
            const chain = new NodeChain(mockFactory);
            const destinationA = { connect: vi.fn(), disconnect: vi.fn() };
            const destinationB = { connect: vi.fn(), disconnect: vi.fn() };

            chain.connectTo(destinationA as any);
            chain.connectTo(destinationB as any);

            expect(chain.outputNode.disconnect).toHaveBeenCalledWith(destinationA);
            expect(chain.outputNode.connect).toHaveBeenCalledWith(destinationB);
        });

        it('should clear external destination on disconnect()', () => {
            const chain = new NodeChain(mockFactory);
            const mockDestination = { connect: vi.fn(), disconnect: vi.fn() };

            chain.connectTo(mockDestination as any);
            chain.disconnect();

            expect(chain.outputNode.disconnect).toHaveBeenCalledWith(mockDestination);

            const disconnectSpy = vi.mocked(chain.outputNode.disconnect);

            disconnectSpy.mockClear();

            chain.disconnect();
            expect(disconnectSpy).not.toHaveBeenCalled();
        });
    });

    it('should correctly handle dispose()', () => {
        const chain = new NodeChain(mockFactory, {
            hasPanner: true,
            initialFilters: [{ type: 'lowpass', frequency: 1000 }]
        });

        const mockDestination = { connect: vi.fn(), disconnect: vi.fn() };
        chain.connectTo(mockDestination as any);

        chain.dispose();

        expect(chain.inputNode.disconnect).toHaveBeenCalled();
        expect(createdNodes[0].disconnect).toHaveBeenCalled();
        expect(chain.pannerNode?.disconnect).toHaveBeenCalled();
        expect(chain.outputNode.disconnect).toHaveBeenCalled();
    });
});
