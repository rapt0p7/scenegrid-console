import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { ContextTime, LayerId, Milliseconds, SnapshotId } from '@scene-grid/shared';

import MixerSnapshotManager from '@domain/Mixer/MixerSnapshotManager.js';
import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';

describe('MixerSnapshotManager', () => {
    let manager: MixerSnapshotManager;
    let mockLayerStack: any;
    let mockCoordinator: any;
    let mockSnapshots: Record<string, any>;
    let mockController: Mocked<ISoundController>;
    let mockTelemetry: Mocked<ITelemetryDispatcher>;
    let emitSpy: any;

    beforeEach(() => {
        mockLayerStack = {
            addLayer: vi.fn(),
            removeLayer: vi.fn(),
            hasLayer: vi.fn()
        };

        mockController = {
            getCurrentTime: vi.fn().mockReturnValue(1.5)
        } as unknown as Mocked<ISoundController>;

        mockTelemetry = {
            dispatch: vi.fn()
        } as unknown as Mocked<ITelemetryDispatcher>;

        mockCoordinator = {
            recompute: vi.fn().mockResolvedValue(undefined)
        };

        mockSnapshots = {
            ['muffled_underwater' as SnapshotId]: { buses: { master: { filter: 'lowpass' } } },
            ['pause_menu' as SnapshotId]: { buses: { sfx: { volume: 0 } } }
        };

        manager = new MixerSnapshotManager(
            mockLayerStack,
            mockSnapshots,
            mockCoordinator,
            mockTelemetry,
            mockController
        );

        emitSpy = vi.spyOn(manager.events, 'emit');
    });

    describe('activateSnapshot', () => {
        it('should return early and do nothing if snapshot name is unknown', () => {
            manager.activateSnapshot('unknown_snapshot' as SnapshotId, 'layer_1' as LayerId, 100);

            expect(emitSpy).not.toHaveBeenCalled();
            expect(mockLayerStack.addLayer).not.toHaveBeenCalled();
            expect(mockCoordinator.recompute).not.toHaveBeenCalled();
            expect(mockTelemetry.dispatch).not.toHaveBeenCalled();
        });

        it('should activate snapshot, push to layer stack, and emit events', () => {
            manager.activateSnapshot('muffled_underwater' as SnapshotId, 'layer_underwater' as LayerId, 50);

            expect(emitSpy).toHaveBeenNthCalledWith(1, 'snapshot:enter', {
                layerId: 'layer_underwater',
                snapshotName: 'muffled_underwater',
                priority: 50
            });
            expect(emitSpy).toHaveBeenNthCalledWith(2, 'transition:start', {
                layerId: 'layer_underwater',
                snapshotName: 'muffled_underwater',
                duration: 500
            });
            expect(emitSpy).toHaveBeenNthCalledWith(3, 'transition:end', {
                layerId: 'layer_underwater',
                snapshotName: 'muffled_underwater'
            });

            expect(mockLayerStack.addLayer).toHaveBeenCalledWith({
                id: 'layer_underwater',
                priority: 50,
                snapshot: {
                    buses: { master: { filter: 'lowpass' } },
                    metadata: {
                        snapshotId: 'muffled_underwater',
                        timestamp: expect.any(Number)
                    }
                }
            });
        });

        it('should dispatch telemetry cause chain packet with timestamp in milliseconds when activating snapshot', () => {
            mockController.getCurrentTime.mockReturnValue(1.5 as ContextTime);

            manager.activateSnapshot(
                'muffled_underwater' as SnapshotId,
                'layer_underwater' as LayerId,
                50,
                500 as Milliseconds
            );

            expect(mockTelemetry.dispatch).toHaveBeenCalledTimes(1);
            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'CAUSE_CHAIN',
                timestampMs: 1500,
                initiator: {
                    type: 'API',
                    method: 'activateSnapshot'
                },
                result: {
                    type: 'SET_MIX_SNAPSHOT',
                    snapshotId: 'muffled_underwater',
                    fadeTime: 500
                },
                conditionTrace: undefined
            });
        });
    });

    describe('clearLayer', () => {
        it('should return early and do nothing if layer does not exist', () => {
            mockLayerStack.hasLayer.mockReturnValue(false);

            manager.clearLayer('ghost_layer' as LayerId);

            expect(emitSpy).not.toHaveBeenCalled();
            expect(mockLayerStack.removeLayer).not.toHaveBeenCalled();
            expect(mockCoordinator.recompute).not.toHaveBeenCalled();
            expect(mockTelemetry.dispatch).not.toHaveBeenCalled();
        });

        it('should clear an existing layer, emit events and recompute', () => {
            mockLayerStack.hasLayer.mockReturnValue(true);

            manager.clearLayer('layer_pause' as LayerId);

            expect(emitSpy).toHaveBeenNthCalledWith(1, 'snapshot:exit', { layerId: 'layer_pause' });
            expect(emitSpy).toHaveBeenNthCalledWith(2, 'transition:start', {
                layerId: 'layer_pause',
                snapshotName: 'clear',
                duration: 500
            });
            expect(emitSpy).toHaveBeenNthCalledWith(3, 'transition:end', {
                layerId: 'layer_pause',
                snapshotName: 'clear'
            });

            expect(mockLayerStack.removeLayer).toHaveBeenCalledWith('layer_pause');
        });

        it('should pass transition duration to coordinator recompute when clearing layer', () => {
            mockLayerStack.hasLayer.mockReturnValue(true);

            manager.clearLayer('layer_pause' as LayerId, 300 as Milliseconds);

            expect(mockCoordinator.recompute).toHaveBeenCalledWith({ duration: 300 });
        });

        it('should dispatch telemetry with CLEAR snapshot ID and clearLayer method when clearing layer', () => {
            mockLayerStack.hasLayer.mockReturnValue(true);
            mockController.getCurrentTime.mockReturnValue(2.0 as ContextTime);

            manager.clearLayer('layer_pause' as LayerId, 300 as Milliseconds);

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'CAUSE_CHAIN',
                timestampMs: 2000,
                initiator: {
                    type: 'API',
                    method: 'clearLayer'
                },
                result: {
                    type: 'SET_MIX_SNAPSHOT',
                    snapshotId: 'CLEAR',
                    fadeTime: 300
                },
                conditionTrace: undefined
            });
        });
    });

    describe('updateSnapshotsConfig', () => {
        it('should inject fresh snapshot data into active layers matching by snapshotId', () => {
            const mockLayerStackLocal = {
                getLayers: vi.fn(),
                updateLayer: vi.fn(),
                addLayer: vi.fn(),
                hasLayer: vi.fn(),
                removeLayer: vi.fn()
            };

            const initialSnapshots = { combat: { buses: { sfx: { gain: 2 } } } };
            const hmrManager = new MixerSnapshotManager(
                mockLayerStackLocal as any,
                initialSnapshots,
                mockCoordinator,
                mockTelemetry,
                mockController
            );

            mockLayerStackLocal.getLayers.mockReturnValue([
                { id: 'layer_1', snapshot: { metadata: { snapshotId: 'combat' } } },
                {
                    id: 'layer_2',
                    snapshot: {
                        metadata: {/* no snapshotId */}
                    }
                }
            ]);

            const newSnapshots = {
                combat: { buses: { sfx: { gain: 5, filter: { type: 'lowpass' } } } }
            };

            hmrManager.updateSnapshotsConfig(newSnapshots);

            expect(mockLayerStackLocal.updateLayer).toHaveBeenCalledTimes(1);
            expect(mockLayerStackLocal.updateLayer).toHaveBeenCalledWith('layer_1', {
                buses: { sfx: { gain: 5, filter: { type: 'lowpass' } } },
                metadata: { snapshotId: 'combat' }
            });

            expect((hmrManager as any).snapshots).toBe(newSnapshots);
        });

        it('should safely skip layer update when layer snapshot metadata is undefined', () => {
            const mockLayerStackLocal = {
                getLayers: vi.fn().mockReturnValue([{ id: 'layer_without_metadata', snapshot: {} }]),
                updateLayer: vi.fn()
            };
            const hmrManager = new MixerSnapshotManager(
                mockLayerStackLocal as any,
                {},
                mockCoordinator,
                mockTelemetry,
                mockController
            );

            expect(() => {
                hmrManager.updateSnapshotsConfig({});
            }).not.toThrow();
            expect(mockLayerStackLocal.updateLayer).not.toHaveBeenCalled();
        });

        it('should not update layer when snapshotId exists on layer but is missing from newSnapshots config', () => {
            const mockLayerStackLocal = {
                getLayers: vi
                    .fn()
                    .mockReturnValue([{ id: 'layer_1', snapshot: { metadata: { snapshotId: 'removed_snapshot' } } }]),
                updateLayer: vi.fn()
            };
            const newSnapshots = {
                combat: { buses: {} }
            };
            const hmrManager = new MixerSnapshotManager(
                mockLayerStackLocal as any,
                {},
                mockCoordinator,
                mockTelemetry,
                mockController
            );

            hmrManager.updateSnapshotsConfig(newSnapshots);

            expect(mockLayerStackLocal.updateLayer).not.toHaveBeenCalled();
        });
    });

    describe('telemetryPool', () => {
        it('should pre-allocate telemetry packets with correct default values in the cycle pool', () => {
            const packet = (manager as any).telemetryPool.getNext();

            expect(packet).toEqual({
                type: 'CAUSE_CHAIN',
                timestampMs: 0,
                initiator: {
                    type: 'API',
                    method: ''
                },
                result: {
                    type: 'SET_MIX_SNAPSHOT',
                    snapshotId: '',
                    fadeTime: 0
                },
                conditionTrace: undefined
            });
        });
    });

    describe('debugLayerStack', () => {
        it('should return the internal layerStack instance', () => {
            expect(manager.debugLayerStack).toBe(mockLayerStack);
        });
    });

    describe('dispatchTelemetrySnapshotChange (telemetry disabled)', () => {
        it('should return early without error when telemetry dispatcher is not provided', () => {
            const managerWithoutTelemetry = new MixerSnapshotManager(
                mockLayerStack,
                mockSnapshots,
                mockCoordinator,
                undefined as any,
                mockController
            );

            expect(() => {
                managerWithoutTelemetry.activateSnapshot('muffled_underwater' as SnapshotId, 'layer_1' as LayerId, 10);
            }).not.toThrow();
        });
    });
});
