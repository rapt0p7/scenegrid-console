// noinspection D
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { NodeChain } from '../NodeChain.js';

import type { AudioNodeFactory } from '@infrastructure/nodes/AudioNodeFactory.js';

describe('NodeChain (Deep Module & Zero-Allocation)', () => {
    let mockFactory: any;
    let createdGains: any[];
    let createdFilters: any[];
    let createdPanners: any[];

    beforeEach(() => {
        vi.clearAllMocks();
        createdGains = [];
        createdFilters = [];
        createdPanners = [];

        mockFactory = {
            createGain: vi.fn().mockImplementation(() => {
                const node = { type: 'gain', gain: {}, connect: vi.fn(), disconnect: vi.fn() };
                createdGains.push(node);
                return node;
            }),
            createFilter: vi.fn().mockImplementation(cfg => {
                const node = {
                    type: cfg?.type ?? 'lowpass',
                    frequency: { value: cfg?.frequency ?? 22000 },
                    Q: { value: cfg?.Q ?? 1 },
                    connect: vi.fn(),
                    disconnect: vi.fn()
                };
                createdFilters.push(node);
                return node;
            }),
            createStereoPanner: vi.fn().mockImplementation(() => {
                const node = { type: 'stereo_panner', connect: vi.fn(), disconnect: vi.fn() };
                createdPanners.push(node);
                return node;
            }),
            create3DPanner: vi.fn().mockImplementation(() => {
                const node = {
                    type: '3d_panner',
                    positionX: { value: 0 },
                    positionY: { value: 0 },
                    positionZ: { value: 0 },
                    setPosition: vi.fn(),
                    connect: vi.fn(),
                    disconnect: vi.fn()
                };
                createdPanners.push(node);
                return node;
            })
        } as unknown as AudioNodeFactory;
    });

    describe('Initialization & Internal Graph', () => {
        it('should initialize input and output gain nodes', () => {
            const chain = new NodeChain(mockFactory);

            expect(mockFactory.createGain).toHaveBeenCalledTimes(2);
            expect(createdGains.length).toBe(2);

            expect(chain.gainParam).toBe(createdGains[0].gain);
        });

        it('should connect nodes sequentially (Input -> Filter 1 -> Filter 2 -> Output)', () => {
            // oxlint-disable-next-line no-new
            new NodeChain(mockFactory, {
                initialFilters: [
                    { type: 'lowpass', frequency: 1000 },
                    { type: 'highpass', frequency: 500 }
                ]
            });

            const inputNode = createdGains[0];
            const outputNode = createdGains[1];
            const filter1 = createdFilters[0];
            const filter2 = createdFilters[1];

            expect(inputNode.connect).toHaveBeenCalledWith(filter1);
            expect(filter1.connect).toHaveBeenCalledWith(filter2);
            expect(filter2.connect).toHaveBeenCalledWith(outputNode);
        });
    });

    describe('Zero-Allocation Object Pool (Filters)', () => {
        it('should mutate existing filters instead of creating new ones on setFilters', () => {
            const chain = new NodeChain(mockFactory, {
                initialFilters: [{ type: 'lowpass', frequency: 1000, Q: 1 }]
            });

            expect(mockFactory.createFilter).toHaveBeenCalledTimes(1);
            const pooledFilter = createdFilters[0];

            pooledFilter.connect.mockClear();
            pooledFilter.disconnect.mockClear();

            chain.setFilters([{ type: 'highpass', frequency: 500, Q: 2 }]);

            expect(mockFactory.createFilter).toHaveBeenCalledTimes(1);

            expect(pooledFilter.type).toBe('highpass');
            expect(pooledFilter.frequency.value).toBe(500);
            expect(pooledFilter.Q.value).toBe(2);

            expect(pooledFilter.disconnect).toHaveBeenCalled();
            expect(pooledFilter.connect).toHaveBeenCalledWith(createdGains[1]);
        });

        it('should dynamically expand the pool ONLY if needed', () => {
            const chain = new NodeChain(mockFactory, {
                initialFilters: [{ type: 'lowpass', frequency: 500 }]
            });

            expect(mockFactory.createFilter).toHaveBeenCalledTimes(1);

            chain.setFilters([
                { type: 'lowpass', frequency: 500 },
                { type: 'highpass', frequency: 500 },
                { type: 'bandpass', frequency: 500 }
            ]);

            expect(mockFactory.createFilter).toHaveBeenCalledTimes(3);
            expect(createdFilters.length).toBe(3);
        });

        it('should bypass unused filters when setting fewer configs than pool size', () => {
            const chain = new NodeChain(mockFactory, {
                initialFilters: [
                    { type: 'lowpass', frequency: 500 },
                    { type: 'highpass', frequency: 500 }
                ]
            });

            chain.setFilters([{ type: 'bandpass', frequency: 500 }]);

            const inputNode = createdGains[0];
            const outputNode = createdGains[1];
            const activeFilter = createdFilters[0];
            const unusedFilter = createdFilters[1];

            expect(unusedFilter.disconnect).toHaveBeenCalled();

            expect(inputNode.connect).toHaveBeenCalledWith(activeFilter);
            expect(activeFilter.connect).toHaveBeenCalledWith(outputNode);

            expect(chain.mainFilterNode).toBe(activeFilter);
        });
    });

    describe('Panner Configuration', () => {
        it('should build graph WITH 3D PannerNode if spatial option is provided', () => {
            const chain = new NodeChain(mockFactory, { spatial: true });

            expect(mockFactory.create3DPanner).toHaveBeenCalledWith(true);
            expect(chain.pannerNode).toBeDefined();
            expect(mockFactory.createStereoPanner).not.toHaveBeenCalled();

            const inputNode = createdGains[0];
            const outputNode = createdGains[1];
            const panner = createdPanners[0];

            expect(inputNode.connect).toHaveBeenCalledWith(panner);
            expect(panner.connect).toHaveBeenCalledWith(outputNode);
        });

        it('should build graph WITH StereoPannerNode if hasPanner is true and spatial is undefined', () => {
            // oxlint-disable-next-line no-new
            new NodeChain(mockFactory, { hasPanner: true });

            expect(mockFactory.createStereoPanner).toHaveBeenCalledWith(0);
            expect(mockFactory.create3DPanner).not.toHaveBeenCalled();
        });

        it('should hot-swap panner mode and rebuild graph without leaking', () => {
            const chain = new NodeChain(mockFactory, { hasPanner: true });
            const stereoPanner = createdPanners[0];

            chain.setPannerMode({ spatial: true });
            const spatialPanner = createdPanners[1];

            expect(stereoPanner.disconnect).toHaveBeenCalled();
            expect(spatialPanner.connect).toHaveBeenCalledWith(createdGains[1]);
            expect(chain.pannerNode).toBe(spatialPanner);
        });
    });

    describe('External Connections & Lifecycle', () => {
        it('should connect outputNode to external destination', () => {
            const chain = new NodeChain(mockFactory);
            const mockDestination = { connect: vi.fn(), disconnect: vi.fn() };
            const outputNode = createdGains[1];

            chain.connectTo(mockDestination as any);
            expect(outputNode.connect).toHaveBeenCalledWith(mockDestination);
        });

        it('should properly route disconnect logic for external destinations', () => {
            const chain = new NodeChain(mockFactory);
            const destinationA = { connect: vi.fn(), disconnect: vi.fn() };
            const destinationB = { connect: vi.fn(), disconnect: vi.fn() };
            const outputNode = createdGains[1];

            chain.connectTo(destinationA as any);
            chain.connectTo(destinationB as any);

            expect(outputNode.disconnect).toHaveBeenCalledWith(destinationA);
            expect(outputNode.connect).toHaveBeenCalledWith(destinationB);

            chain.disconnect();
            expect(outputNode.disconnect).toHaveBeenCalledWith(destinationB);
        });

        it('should gracefully handle dispose() and tear down the entire chain', () => {
            const chain = new NodeChain(mockFactory, {
                hasPanner: true,
                initialFilters: [{ type: 'lowpass', frequency: 1000 }]
            });

            const mockDestination = { connect: vi.fn(), disconnect: vi.fn() };
            chain.connectTo(mockDestination as any);

            chain.dispose();

            const inputNode = createdGains[0];
            const outputNode = createdGains[1];
            const filter = createdFilters[0];
            const panner = createdPanners[0];

            expect(inputNode.disconnect).toHaveBeenCalled();
            expect(filter.disconnect).toHaveBeenCalled();
            expect(panner.disconnect).toHaveBeenCalled();
            expect(outputNode.disconnect).toHaveBeenCalled();
        });
    });
});
