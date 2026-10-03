import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

import { describe, expect, it, vi } from 'vitest';

import RoutingCyclesRule from '../RoutingCyclesRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('RoutingCyclesRule', () => {
    describe('validate', () => {
        it('should return cleanly without errors when buses configuration is absent (Line 9)', () => {
            const rule = new RoutingCyclesRule();
            const context = createStubContext({});
            // @ts-expect-error Rewriting for test
            context.config.buses = undefined as any;

            rule.validate(context);
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should isolate only the cyclic loop and exclude acyclic root prefix nodes (Line 18)', () => {
            const rule = new RoutingCyclesRule();
            const context = createStubContext({
                buses: {
                    master: { sends: { busA: 1 } },
                    busA: { sends: { busB: 1 } },
                    busB: { sends: { busA: 1 } }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);
            expect(context.getErrors()).toContain(
                'Fatal Error: Audio routing loop detected in configuration: busA -> busB -> busA'
            );
        });

        it('should format multi-hop cycles starting from a non-zero index accurately (Lines 13 & 18)', () => {
            const rule = new RoutingCyclesRule();
            const context = createStubContext({
                buses: {
                    main_mix: { sends: { sfx_send: 1 } },
                    sfx_send: { sends: { reverb_bus: 1 } },
                    reverb_bus: { sends: { delay_bus: 1 } },
                    delay_bus: { sends: { reverb_bus: 1 } }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);
            expect(context.getErrors()).toContain(
                'Fatal Error: Audio routing loop detected in configuration: reverb_bus -> delay_bus -> reverb_bus'
            );
        });

        it('should memoize visited nodes and avoid re-traversing shared bus subgraphs (Line 24)', () => {
            const rule = new RoutingCyclesRule();
            const sharedBusGetter = vi.fn().mockReturnValue(undefined);

            const context = createStubContext({
                buses: {
                    busA: { sends: { busB: 1, busC: 1 } },
                    busB: { sends: { sharedBus: 1 } },
                    busC: { sends: { sharedBus: 1 } },
                    sharedBus: {
                        get sends() {
                            return sharedBusGetter();
                        }
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(sharedBusGetter).toHaveBeenCalledTimes(1);
        });

        it('should safely handle null or undefined bus entries in buses dictionary (Line 29)', () => {
            const rule = new RoutingCyclesRule();
            const context = createStubContext({
                buses: {
                    corruptedNull: null as any,
                    corruptedUndefined: undefined as any,
                    validBus: { sends: {} }
                }
            });

            rule.validate(context);
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should not invoke dfs on target buses that do not exist in buses config (Line 32)', () => {
            const rule = new RoutingCyclesRule();
            const context = createStubContext({
                buses: {
                    busA: { sends: { ghost_bus: 1 } }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should skip invoking dfs from the outer loop for already visited buses (Line 44)', () => {
            const rule = new RoutingCyclesRule();
            const busBGetter = vi.fn().mockReturnValue(undefined);

            const context = createStubContext({
                buses: {
                    busA: { sends: { busB: 1 } },
                    busB: {
                        get sends() {
                            return busBGetter();
                        }
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(busBGetter).toHaveBeenCalledTimes(1);
        });

        it('should accurately resolve cycle path without poisoning when a bus matches initial state (Line 13:32)', () => {
            const rule = new RoutingCyclesRule();
            const context = createStubContext({
                buses: {
                    'root_bus': { sends: { 'Stryker was here': 1 } },
                    'Stryker was here': { sends: { sub_bus: 1 } },
                    'sub_bus': { sends: { 'Stryker was here': 1 } }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);
            expect(context.getErrors()).toContain(
                'Fatal Error: Audio routing loop detected in configuration: Stryker was here -> sub_bus -> Stryker was here'
            );
        });

        it('should not invoke dfs on target buses that do not exist in config (Line 32:25)', () => {
            const rule = new RoutingCyclesRule();
            const accessedBuses: string[] = [];
            const buses = {
                busA: { sends: { ghost_target: 1 } }
            };
            const proxyBuses = new Proxy(buses, {
                get(target, prop: string) {
                    if (typeof prop === 'string') accessedBuses.push(prop);
                    return target[prop as keyof typeof target];
                }
            });
            const context = createStubContext({});
            // @ts-expect-error Rewriting for test
            context.config.buses = proxyBuses as any;

            rule.validate(context);

            const ghostAccessCount = accessedBuses.filter(b => b === 'ghost_target').length;
            expect(ghostAccessCount).toBe(1);
        });
    });
});
