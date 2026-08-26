import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { IRTPCConfig } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { MixerSnapshot, MixerState } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';
import type { BusId } from '@scene-grid/shared';

import MixerStateResolver, { ResolvedBusState } from '@domain/Mixer/MixerStateResolver.js';
import { describe, it, expect } from 'vitest';

describe('MixerStateResolver', () => {
    const dummyFilter: IFilter = { type: 'lowpass', frequency: 1000 } as unknown as IFilter;
    const dummyRtpc = {
        curve: [
            { x: 0, y: 0 },
            { x: 1, y: 1 }
        ]
    } as unknown as IRTPCConfig;

    describe('Initialization', () => {
        it('should initialize with default bus gain of 1 if not provided', () => {
            const resolver = new MixerStateResolver();
            const result = resolver.resolve({ buses: {} }, { buses: { master: {} } } as unknown as MixerSnapshot);

            expect(result.buses['master' as BusId].gain).toBe(1);
        });

        it('should initialize with custom default bus gain', () => {
            const resolver = new MixerStateResolver({ defaultBusGain: 0.5 });
            const result = resolver.resolve({ buses: {} }, { buses: { master: {} } } as unknown as MixerSnapshot);

            expect(result.buses['master' as BusId].gain).toBe(0.5);
        });
    });

    describe('State Merging (Top-level)', () => {
        it('should merge metadata and inject a new timestamp', () => {
            const resolver = new MixerStateResolver();
            const base = {
                metadata: { snapshotId: 'base_snap', timestamp: 0 },
                buses: {}
            };
            const patch = {
                metadata: { snapshotId: 'patch_snap', timestamp: 1 },
                buses: {}
            };

            const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);

            expect(result.metadata).toEqual({
                snapshotId: 'patch_snap',
                timestamp: expect.any(Number)
            });
        });

        it('should handle undefined buses gracefully', () => {
            const resolver = new MixerStateResolver();
            const base = { metadata: { timestamp: 0 }, buses: undefined };
            const patch = { buses: undefined };

            const result = resolver.resolve(base as unknown as MixerState, patch);
            expect(result.buses).toEqual({});
        });
    });

    describe('Property Resolution Logic', () => {
        const resolver = new MixerStateResolver();

        describe('Gain Resolution', () => {
            it('should modulate patch gain with base gain', () => {
                const base = { buses: { master: { gain: 0.8 } } };
                const patch = { buses: { master: { gain: 0.2 } } };

                const result = resolver.resolve(base, patch);
                expect(result.buses['master' as BusId].gain).toBeCloseTo(0.16, 5);
            });

            it('should fallback to base gain if patch gain is undefined', () => {
                const base = { buses: { master: { gain: 0.8 } } };
                const patch = { buses: { master: {} } };

                const result = resolver.resolve(base, patch);
                expect(result.buses['master' as BusId].gain).toBe(0.8);
            });
        });

        describe('Filter Resolution', () => {
            it('should return null if patch filter is strictly null (explicit deletion)', () => {
                const base = { buses: { master: { filter: dummyFilter } } };
                const patch = { buses: { master: { filter: null } } };

                const result = resolver.resolve(base, patch);
                expect(result.buses['master' as BusId].filter).toBeNull();
            });

            it('should return patch filter if provided', () => {
                const base = { buses: { master: { filter: null } } };
                const patch = { buses: { master: { filter: dummyFilter } } };

                const result = resolver.resolve(base, patch);
                expect(result.buses['master' as BusId].filter).toBe(dummyFilter);
            });

            it('should fallback to base filter if patch filter is undefined', () => {
                const base = { buses: { master: { filter: dummyFilter } } };
                const patch = { buses: { master: {} } };

                const result = resolver.resolve(base, patch);
                expect(result.buses['master' as BusId].filter).toBe(dummyFilter);
            });

            it('should return null if neither base nor patch has a filter', () => {
                const result = resolver.resolve(
                    { buses: { master: {} } } as unknown as MixerState,
                    { buses: { master: {} } } as unknown as MixerSnapshot
                );
                expect(result.buses['master' as BusId].filter).toBeNull();
            });
        });

        describe('Sends Resolution', () => {
            it('should return a copy of base if patch sends are undefined', () => {
                const base = { buses: { master: { sends: { reverb: 0.5 } } } };
                const patch = { buses: { master: {} } };

                const result = resolver.resolve(base, patch);
                expect(result.buses['master' as BusId].sends).toEqual({ reverb: 0.5 });
            });

            it('should add or update sends from patch using modulation', () => {
                const base = { buses: { master: { sends: { reverb: 0.5, delay: 0.2 } } } };
                const patch = { buses: { master: { sends: { reverb: 0.8, chorus: 0.1 } } } };

                const result = resolver.resolve(base, patch);

                expect(result.buses['master' as BusId].sends?.['reverb' as BusId]).toBeCloseTo(0.4, 5);
                expect(result.buses['master' as BusId].sends?.['delay' as BusId]).toBeCloseTo(0.2, 5);
                expect(result.buses['master' as BusId].sends?.['chorus' as BusId]).toBeCloseTo(0.1, 5);
            });

            it('should delete a send if the patch value is strictly null', () => {
                const base = { buses: { master: { sends: { reverb: 0.5, delay: 0.2 } } } };
                const patch = { buses: { master: { sends: { reverb: null } } } };

                const result = resolver.resolve(base, patch);
                expect(result.buses['master' as BusId].sends).toEqual({ delay: 0.2 });
                expect(result.buses['master' as BusId].sends).not.toHaveProperty('reverb');
            });
        });

        describe('RTPC Resolution', () => {
            it('should return empty object if patch rtpc is strictly null (clear all)', () => {
                const base = { buses: { master: { rtpc: { volume: dummyRtpc } } } };
                const patch = { buses: { master: { rtpc: null } } };

                const result = resolver.resolve(base, patch);
                expect(result.buses['master' as BusId].rtpc).toEqual({});
            });

            it('should return copy of base if patch rtpc is undefined', () => {
                const base = { buses: { master: { rtpc: { volume: dummyRtpc } } } };
                const patch = { buses: { master: {} } };

                const result = resolver.resolve(base, patch);
                expect(result.buses['master' as BusId].rtpc).toEqual({ volume: dummyRtpc });
            });

            it('should return empty object if both base and patch rtpc are undefined', () => {
                const result = resolver.resolve(
                    { buses: { master: {} } } as unknown as MixerState,
                    { buses: { master: {} } } as unknown as MixerSnapshot
                );
                expect(result.buses['master' as BusId].rtpc).toEqual({});
            });

            it('should add or update RTPC configs from patch', () => {
                const base = { buses: { master: { rtpc: { volume: dummyRtpc } } } };
                const newRtpc = {
                    curve: [
                        { x: 0, y: 1 },
                        { x: 100, y: 0 }
                    ]
                } as unknown as IRTPCConfig;
                const patch = { buses: { master: { rtpc: { filterFreq: newRtpc } } } };

                const result = resolver.resolve(base, patch);
                expect(result.buses['master' as BusId].rtpc).toEqual({
                    volume: dummyRtpc,
                    filterFreq: newRtpc
                });
            });

            it('should delete specific RTPC config if patch value is strictly null', () => {
                const base = { buses: { master: { rtpc: { volume: dummyRtpc, filterFreq: dummyRtpc } } } };
                const patch = { buses: { master: { rtpc: { filterFreq: null } } } };

                const result = resolver.resolve(base, patch);
                expect(result.buses['master' as BusId].rtpc).toEqual({ volume: dummyRtpc });
                expect(result.buses['master' as BusId].rtpc).not.toHaveProperty('filterFreq');
            });
        });
    });

    it('should handle undefined base.buses when patch has buses', () => {
        const resolver = new MixerStateResolver();
        const base = { metadata: { timestamp: 0 }, buses: undefined };
        const patch = { buses: { master: { gain: 0.5 } } };

        const result = resolver.resolve(base as unknown as MixerState, patch);

        expect(result.buses['master' as BusId].gain).toBe(0.5);
    });

    it('should handle undefined patch.buses when base has buses', () => {
        const resolver = new MixerStateResolver();
        const base = { buses: { master: { gain: 0.8 } } };
        const patch = { metadata: { timestamp: 0 }, buses: undefined };

        const result = resolver.resolve(base, patch);

        expect(result.buses['master' as BusId].gain).toBe(0.8);
    });

    it('should preserve base bus state when bus is entirely omitted from patch', () => {
        const resolver = new MixerStateResolver();
        const base = {
            buses: {
                sfx: {
                    gain: 0.5,
                    filter: dummyFilter,
                    sidechain: { enabled: true },
                    sends: { reverb: 0.3 },
                    rtpc: { volume: dummyRtpc }
                }
            }
        };
        const patch = { buses: {} };

        const result = resolver.resolve(base, patch);
        const bus = result.buses['sfx' as BusId] as unknown as ResolvedBusState;

        expect(bus.gain).toBe(0.5);
        expect(bus.filter).toBe(dummyFilter);
        expect(bus.sidechain.enabled).toBe(true);
        expect(bus.sends).toEqual({ reverb: 0.3 });
        expect(bus.rtpc).toEqual({ volume: dummyRtpc });
    });

    it('should ignore undefined values in patch sends and retain base send gain', () => {
        const resolver = new MixerStateResolver();
        const base = { buses: { master: { sends: { reverb: 0.5 } } } };
        const patch = { buses: { master: { sends: { reverb: undefined as unknown as number } } } };

        const result = resolver.resolve(base, patch);

        expect(result.buses['master' as BusId].sends).toEqual({ reverb: 0.5 });
    });

    it('should resolve patch sends safely when base sends are undefined', () => {
        const resolver = new MixerStateResolver();
        const base = { buses: { master: { sends: undefined } } };
        const patch = { buses: { master: { sends: { reverb: 0.5 } } } };

        const result = resolver.resolve(base, patch);

        expect(result.buses['master' as BusId].sends).toEqual({ reverb: 0.5 });
    });

    it('should default sidechain enabled to false when omitted in both base and patch', () => {
        const resolver = new MixerStateResolver();
        const base = { buses: { master: {} } };
        const patch = { buses: { master: {} } };

        const result = resolver.resolve(base, patch);
        const bus = result.buses['master' as BusId] as unknown as ResolvedBusState;

        expect(bus.sidechain).toEqual({ enabled: false });
    });

    it('should enable sidechain when patch specifies enabled: true', () => {
        const resolver = new MixerStateResolver();
        const base = { buses: { master: { sidechain: { enabled: false } } } };
        const patch = { buses: { master: { sidechain: { enabled: true } } } };

        const result = resolver.resolve(base, patch);
        const bus = result.buses['master' as BusId] as unknown as ResolvedBusState;

        expect(bus.sidechain.enabled).toBe(true);
    });

    it('should ignore undefined values in patch RTPC and retain base config', () => {
        const resolver = new MixerStateResolver();
        const base = { buses: { master: { rtpc: { volume: dummyRtpc } } } };
        const patch = { buses: { master: { rtpc: { volume: undefined } } } };

        const result = resolver.resolve(base, patch);

        expect(result.buses['master' as BusId].rtpc).toEqual({ volume: dummyRtpc });
    });
});
