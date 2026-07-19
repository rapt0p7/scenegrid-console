import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';

import MixerSnapshotManager from '@domain/Mixer/MixerSnapshotManager.js';

import type MixerCoordinator from '@domain/Mixer/MixerCoordinator.js';
import type MixerLayerStack from '@domain/Mixer/MixerLayer.js';
import type { LayerId, SnapshotId } from '@scene-grid/shared';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';

describe('MixerSnapshotManager', () => {
    let manager: MixerSnapshotManager;
    let mockLayerStack: any;
    let mockCoordinator: any;
    let mockSnapshots: Record<string, any>;
    let mockController: Mocked<ISoundController>;
    let mockTelemetry: Mocked<ITelemetryDispatcher>;
    let emitSpy: any;

    beforeEach(() => {
        // Arrange
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
            // oxlint-disable-next-line unicorn/no-useless-undefined
            recompute: vi.fn().mockResolvedValue(undefined)
        };

        mockSnapshots = {
            ['muffled_underwater' as SnapshotId]: { buses: { master: { filter: 'lowpass' } } },
            ['pause_menu' as SnapshotId]: { buses: { sfx: { volume: 0 } } }
        };

        manager = new MixerSnapshotManager(
            mockLayerStack as unknown as MixerLayerStack,
            mockSnapshots,
            mockCoordinator as unknown as MixerCoordinator,
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
        });

        it('should activate snapshot, push to layer stack, emit events and recompute', () => {
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
    });

    describe('clearLayer', () => {
        it('should return early and do nothing if layer does not exist', () => {
            mockLayerStack.hasLayer.mockReturnValue(false);

            manager.clearLayer('ghost_layer' as LayerId);

            expect(emitSpy).not.toHaveBeenCalled();
            expect(mockLayerStack.removeLayer).not.toHaveBeenCalled();
            expect(mockCoordinator.recompute).not.toHaveBeenCalled();
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
    });
});

describe('MixerSnapshotManager - HMR (updateSnapshotsConfig)', () => {
    let mockController: Mocked<ISoundController>;
    let mockTelemetry: Mocked<ITelemetryDispatcher>;
    beforeEach(() => {
        mockController = {
            getCurrentTime: vi.fn().mockReturnValue(1.5)
        } as unknown as Mocked<ISoundController>;

        mockTelemetry = {
            dispatch: vi.fn()
        } as unknown as Mocked<ITelemetryDispatcher>;
    });

    it('should inject fresh snapshot data into active layers matching by snapshotId', () => {
        const mockLayerStack = {
            getLayers: vi.fn(),
            updateLayer: vi.fn(),
            addLayer: vi.fn(),
            hasLayer: vi.fn(),
            removeLayer: vi.fn()
        };
        const mockCoordinator = { recompute: vi.fn() };

        const initialSnapshots = { combat: { buses: { sfx: { gain: 2 } } } };
        const manager = new MixerSnapshotManager(
            mockLayerStack as any,
            initialSnapshots as any,
            mockCoordinator as any,
            mockTelemetry,
            mockController
        );

        mockLayerStack.getLayers.mockReturnValue([
            { id: 'layer_1', snapshot: { metadata: { snapshotId: 'combat' } } },
            {
                id: 'layer_2',
                snapshot: {
                    metadata: {
                        /* no snapshotId */
                    }
                }
            }
        ]);

        const newSnapshots = {
            combat: { buses: { sfx: { gain: 5, filter: { type: 'lowpass' } } } }
        };

        manager.updateSnapshotsConfig(newSnapshots as any);

        expect(mockLayerStack.updateLayer).toHaveBeenCalledTimes(1);
        expect(mockLayerStack.updateLayer).toHaveBeenCalledWith('layer_1', {
            buses: { sfx: { gain: 5, filter: { type: 'lowpass' } } },
            metadata: { snapshotId: 'combat' }
        });

        expect((manager as any).snapshots).toBe(newSnapshots);
    });
});
