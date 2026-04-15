import { describe, it, expect, vi, beforeEach } from 'vitest';

import MixerSnapshotManager from '@domain/Mixer/MixerSnapshotManager.js';

import type MixerCoordinator from '@domain/Mixer/MixerCoordinator.js';
import type MixerLayerStack from '@domain/Mixer/MixerLayer.js';

describe('MixerSnapshotManager', () => {
    let manager: MixerSnapshotManager;
    let mockLayerStack: any;
    let mockCoordinator: any;
    let mockSnapshots: Record<string, any>;
    let emitSpy: any;

    beforeEach(() => {
        // Arrange
        mockLayerStack = {
            addLayer: vi.fn(),
            removeLayer: vi.fn(),
            hasLayer: vi.fn()
        };

        mockCoordinator = {
            recompute: vi.fn().mockResolvedValue(undefined)
        };

        mockSnapshots = {
            muffled_underwater: { buses: { master: { filter: 'lowpass' } } },
            pause_menu: { buses: { sfx: { volume: 0 } } }
        };

        manager = new MixerSnapshotManager(
            mockLayerStack as unknown as MixerLayerStack,
            mockSnapshots,
            mockCoordinator as unknown as MixerCoordinator
        );

        emitSpy = vi.spyOn(manager.events, 'emit');
    });

    describe('activateSnapshot', () => {
        it('should return early and do nothing if snapshot name is unknown', async () => {
            await manager.activateSnapshot('unknown_snapshot', 'layer_1', 100);

            expect(emitSpy).not.toHaveBeenCalled();
            expect(mockLayerStack.addLayer).not.toHaveBeenCalled();
            expect(mockCoordinator.recompute).not.toHaveBeenCalled();
        });

        it('should activate snapshot, push to layer stack, emit events and recompute', async () => {
            await manager.activateSnapshot('muffled_underwater', 'layer_underwater', 50);

            expect(emitSpy).toHaveBeenNthCalledWith(1, 'snapshot:enter', {
                layerId: 'layer_underwater',
                snapshotName: 'muffled_underwater',
                priority: 50
            });
            expect(emitSpy).toHaveBeenNthCalledWith(2, 'transition:start', {
                layerId: 'layer_underwater',
                snapshotName: 'muffled_underwater',
                durationMs: 500
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
        it('should return early and do nothing if layer does not exist', async () => {
            mockLayerStack.hasLayer.mockReturnValue(false);

            await manager.clearLayer('ghost_layer');

            expect(emitSpy).not.toHaveBeenCalled();
            expect(mockLayerStack.removeLayer).not.toHaveBeenCalled();
            expect(mockCoordinator.recompute).not.toHaveBeenCalled();
        });

        it('should clear an existing layer, emit events and recompute', async () => {
            mockLayerStack.hasLayer.mockReturnValue(true);

            await manager.clearLayer('layer_pause');

            expect(emitSpy).toHaveBeenNthCalledWith(1, 'snapshot:exit', { layerId: 'layer_pause' });
            expect(emitSpy).toHaveBeenNthCalledWith(2, 'transition:start', {
                layerId: 'layer_pause',
                snapshotName: 'clear',
                durationMs: 500
            });
            expect(emitSpy).toHaveBeenNthCalledWith(3, 'transition:end', {
                layerId: 'layer_pause',
                snapshotName: 'clear'
            });

            expect(mockLayerStack.removeLayer).toHaveBeenCalledWith('layer_pause');
        });
    });
});
