import { describe, it, expect, vi, beforeEach } from 'vitest';

import MixerLayerStack, { PRIORITY } from '@domain/Mixer/MixerLayer.js';

import type MixerStateResolver from '@domain/Mixer/MixerStateResolver.js';
import type { IMixerLayer } from '@domain/Mixer/Ports/IMixerLayer.js';
import type { MixerState } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';
import type { BusId, LayerId } from '@scene-grid/shared';

describe('MixerLayerStack', () => {
    let layerStack: MixerLayerStack;
    let mockResolver: any;
    let onChangeSpy: any;

    beforeEach(() => {
        mockResolver = {
            resolve: vi.fn().mockImplementation((state, patch) => ({ ...state, ...patch }))
        };
        onChangeSpy = vi.fn();

        layerStack = new MixerLayerStack(mockResolver as unknown as MixerStateResolver, onChangeSpy);
    });

    it('should expose PRIORITY constants correctly', () => {
        expect(PRIORITY.BASE).toBe(0);
        expect(PRIORITY.OVERLAY).toBe(100);
        expect(PRIORITY.MODAL).toBe(200);
        expect(PRIORITY.TRANSIENT).toBe(300);
    });

    it('should add a layer and trigger onChange', () => {
        const layer: IMixerLayer = { id: 'layer1' as LayerId, priority: PRIORITY.BASE, snapshot: { buses: {} } };

        layerStack.addLayer(layer);

        expect(layerStack.hasLayer('layer1' as LayerId)).toBe(true);
        expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });

    it('should remove a layer and trigger onChange', () => {
        const layer: IMixerLayer = { id: 'layer1' as LayerId, priority: PRIORITY.BASE, snapshot: { buses: {} } };
        layerStack.addLayer(layer);
        onChangeSpy.mockClear();

        layerStack.removeLayer('layer1' as LayerId);

        expect(layerStack.hasLayer('layer1' as LayerId)).toBe(false);
        expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });

    it('should update an existing layer and trigger onChange', () => {
        const layer: IMixerLayer = { id: 'layer1' as LayerId, priority: PRIORITY.BASE, snapshot: { buses: {} } };
        layerStack.addLayer(layer);
        onChangeSpy.mockClear();

        const newPatch = { buses: { master: { gain: 0.5, sidechain: { enabled: false } } } };
        layerStack.updateLayer('layer1' as LayerId, newPatch);

        expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });

    it('should do nothing and NOT trigger onChange if updating a non-existent layer', () => {
        layerStack.updateLayer('ghost_layer' as LayerId, { buses: {} });

        expect(onChangeSpy).not.toHaveBeenCalled();
    });

    it('should clear multiple layers by prefix', () => {
        layerStack.addLayer({ id: 'ui:menu' as LayerId, priority: 1, snapshot: { buses: {} } });
        layerStack.addLayer({ id: 'ui:hud' as LayerId, priority: 2, snapshot: { buses: {} } });
        layerStack.addLayer({ id: 'game:ambient' as LayerId, priority: 3, snapshot: { buses: {} } });

        layerStack.clearByPrefix('ui:');

        expect(layerStack.hasLayer('ui:menu' as LayerId)).toBe(false);
        expect(layerStack.hasLayer('ui:hud' as LayerId)).toBe(false);
        expect(layerStack.hasLayer('game:ambient' as LayerId)).toBe(true);
    });

    it('should compute state in correct priority order (lowest to highest)', () => {
        const baseState: MixerState = { buses: { ['master' as BusId]: { gain: 1 } } };

        layerStack.addLayer({ id: 'modal' as LayerId, priority: 200, snapshot: { id: 'modal_snap' } as any });
        layerStack.addLayer({ id: 'base' as LayerId, priority: 0, snapshot: { id: 'base_snap' } as any });
        layerStack.addLayer({ id: 'overlay' as LayerId, priority: 100, snapshot: { id: 'overlay_snap' } as any });

        mockResolver.resolve.mockClear();

        layerStack.computeState(baseState);

        expect(mockResolver.resolve).toHaveBeenCalledTimes(3);

        expect(mockResolver.resolve).toHaveBeenNthCalledWith(1, baseState, { id: 'base_snap' });
        expect(mockResolver.resolve).toHaveBeenNthCalledWith(2, expect.any(Object), { id: 'overlay_snap' });
        expect(mockResolver.resolve).toHaveBeenNthCalledWith(3, expect.any(Object), { id: 'modal_snap' });
    });
});
