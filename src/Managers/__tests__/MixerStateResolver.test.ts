import { describe, it, expect } from 'vitest';

import MixerStateResolver from '../MixerStateResolver';

import type { IFilter } from '../../interfaces/IFilter';
import type { MixerSnapshot, MixerState } from '../../interfaces/IMixerStateManager';
import type { IRTPCConfig } from '../../interfaces/IRTPCManager';

describe('MixerStateResolver', () => {
    describe('Initialization', () => {
        it('should initialize with default bus gain of 1 if not provided', () => {
            const resolver = new MixerStateResolver();
            const result = resolver.resolve(
                { buses: {} } as unknown as MixerState,
                { buses: { master: {} } } as unknown as MixerSnapshot
            );

            expect(result.buses['master'].gain).toBe(1);
        });

        it('should initialize with custom default bus gain', () => {
            const resolver = new MixerStateResolver({ defaultBusGain: 0.5 });
            const result = resolver.resolve(
                { buses: {} } as unknown as MixerState,
                { buses: { master: {} } } as unknown as MixerSnapshot
            );

            expect(result.buses['master'].gain).toBe(0.5);
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

            const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
            expect(result.buses).toEqual({});
        });
    });

    describe('Property Resolution Logic', () => {
        const resolver = new MixerStateResolver();

        describe('Gain Resolution', () => {
            it('should prioritize patch gain over base gain', () => {
                const base = { buses: { master: { gain: 0.8 } } };
                const patch = { buses: { master: { gain: 0.2 } } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].gain).toBe(0.2);
            });

            it('should fallback to base gain if patch gain is undefined', () => {
                const base = { buses: { master: { gain: 0.8 } } };
                const patch = { buses: { master: {} } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].gain).toBe(0.8);
            });
        });

        describe('Filter Resolution', () => {
            const dummyFilter: IFilter = { type: 'lowpass', frequency: 1000 } as unknown as IFilter;

            it('should return null if patch filter is strictly null (explicit deletion)', () => {
                const base = { buses: { master: { filter: dummyFilter } } };
                const patch = { buses: { master: { filter: null } } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].filter).toBeNull();
            });

            it('should return patch filter if provided', () => {
                const base = { buses: { master: { filter: null } } };
                const patch = { buses: { master: { filter: dummyFilter } } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].filter).toBe(dummyFilter);
            });

            it('should fallback to base filter if patch filter is undefined', () => {
                const base = { buses: { master: { filter: dummyFilter } } };
                const patch = { buses: { master: {} } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].filter).toBe(dummyFilter);
            });

            it('should return null if neither base nor patch has a filter', () => {
                const result = resolver.resolve(
                    { buses: { master: {} } } as unknown as MixerState,
                    { buses: { master: {} } } as unknown as MixerSnapshot
                );
                expect(result.buses['master'].filter).toBeNull();
            });
        });

        describe('Sidechain Resolution', () => {
            it('should default to false if not specified anywhere', () => {
                const result = resolver.resolve(
                    { buses: { master: {} } } as unknown as MixerState,
                    { buses: { master: {} } } as unknown as MixerSnapshot
                );
                expect(result.buses['master'].sidechain).toEqual({ enabled: false });
            });

            it('should override base with patch sidechain enabled status', () => {
                const base = { buses: { master: { sidechain: { enabled: true } } } };
                const patch = { buses: { master: { sidechain: { enabled: false } } } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].sidechain).toEqual({ enabled: false });
            });

            it('should fallback to base sidechain if patch sidechain is undefined', () => {
                const base = { buses: { master: { sidechain: { enabled: true } } } };
                const patch = { buses: { master: {} } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].sidechain).toEqual({ enabled: true });
            });
        });

        describe('Sends Resolution', () => {
            it('should return a copy of base if patch sends are undefined', () => {
                const base = { buses: { master: { sends: { reverb: 0.5 } } } };
                const patch = { buses: { master: {} } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].sends).toEqual({ reverb: 0.5 });
            });

            it('should add or update sends from patch', () => {
                const base = { buses: { master: { sends: { reverb: 0.5, delay: 0.2 } } } };
                const patch = { buses: { master: { sends: { reverb: 0.8, chorus: 0.1 } } } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].sends).toEqual({ reverb: 0.8, delay: 0.2, chorus: 0.1 });
            });

            it('should delete a send if the patch value is strictly null', () => {
                const base = { buses: { master: { sends: { reverb: 0.5, delay: 0.2 } } } };
                const patch = { buses: { master: { sends: { reverb: null } } } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].sends).toEqual({ delay: 0.2 });
                expect(result.buses['master'].sends).not.toHaveProperty('reverb');
            });
        });

        describe('RTPC Resolution', () => {
            const dummyRtpc = {
                curve: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 }
                ]
            } as unknown as IRTPCConfig;

            it('should return empty object if patch rtpc is strictly null (clear all)', () => {
                const base = { buses: { master: { rtpc: { volume: dummyRtpc } } } };
                const patch = { buses: { master: { rtpc: null } } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].rtpc).toEqual({});
            });

            it('should return copy of base if patch rtpc is undefined', () => {
                const base = { buses: { master: { rtpc: { volume: dummyRtpc } } } };
                const patch = { buses: { master: {} } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].rtpc).toEqual({ volume: dummyRtpc });
            });

            it('should return empty object if both base and patch rtpc are undefined', () => {
                const result = resolver.resolve(
                    { buses: { master: {} } } as unknown as MixerState,
                    { buses: { master: {} } } as unknown as MixerSnapshot
                );
                expect(result.buses['master'].rtpc).toEqual({});
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

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].rtpc).toEqual({
                    volume: dummyRtpc,
                    filterFreq: newRtpc
                });
            });

            it('should delete specific RTPC config if patch value is strictly null', () => {
                const base = { buses: { master: { rtpc: { volume: dummyRtpc, filterFreq: dummyRtpc } } } };
                const patch = { buses: { master: { rtpc: { filterFreq: null } } } };

                const result = resolver.resolve(base as unknown as MixerState, patch as unknown as MixerSnapshot);
                expect(result.buses['master'].rtpc).toEqual({ volume: dummyRtpc });
                expect(result.buses['master'].rtpc).not.toHaveProperty('filterFreq');
            });
        });
    });
});
