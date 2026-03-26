import { describe, it, expect, vi, beforeEach } from 'vitest';

import MixerLayerStack, { PRIORITY } from '../MixerLayer';

import type { IMixerLayer } from '../../interfaces/IMixerLayer';
import type { MixerState } from '../../interfaces/IMixerStateManager';
import type MixerStateResolver from '../MixerStateResolver';

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
        const layer: IMixerLayer = { id: 'layer1', priority: PRIORITY.BASE, snapshot: { buses: {} } };

        layerStack.addLayer(layer);

        expect(layerStack.hasLayer('layer1')).toBe(true);
        expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });

    it('should remove a layer and trigger onChange', () => {
        const layer: IMixerLayer = { id: 'layer1', priority: PRIORITY.BASE, snapshot: { buses: {} } };
        layerStack.addLayer(layer);
        onChangeSpy.mockClear();

        layerStack.removeLayer('layer1');

        expect(layerStack.hasLayer('layer1')).toBe(false);
        expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });

    it('should update an existing layer and trigger onChange', () => {
        const layer: IMixerLayer = { id: 'layer1', priority: PRIORITY.BASE, snapshot: { buses: {} } };
        layerStack.addLayer(layer);
        onChangeSpy.mockClear();

        const newPatch = { buses: { master: { gain: 0.5, sidechain: { enabled: false } } } };
        layerStack.updateLayer('layer1', newPatch);

        expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });

    it('should do nothing and NOT trigger onChange if updating a non-existent layer', () => {
        layerStack.updateLayer('ghost_layer', { buses: {} });

        expect(onChangeSpy).not.toHaveBeenCalled();
    });

    it('should clear multiple layers by prefix', () => {
        layerStack.addLayer({ id: 'ui:menu', priority: 1, snapshot: { buses: {} } });
        layerStack.addLayer({ id: 'ui:hud', priority: 2, snapshot: { buses: {} } });
        layerStack.addLayer({ id: 'game:ambient', priority: 3, snapshot: { buses: {} } });

        layerStack.clearByPrefix('ui:');

        expect(layerStack.hasLayer('ui:menu')).toBe(false);
        expect(layerStack.hasLayer('ui:hud')).toBe(false);
        expect(layerStack.hasLayer('game:ambient')).toBe(true);
    });

    it('should compute state in correct priority order (lowest to highest)', () => {
        const baseState: MixerState = { buses: { master: { gain: 1 } } };

        layerStack.addLayer({ id: 'modal', priority: 200, snapshot: { id: 'modal_snap' } as any });
        layerStack.addLayer({ id: 'base', priority: 0, snapshot: { id: 'base_snap' } as any });
        layerStack.addLayer({ id: 'overlay', priority: 100, snapshot: { id: 'overlay_snap' } as any });

        mockResolver.resolve.mockClear();

        layerStack.computeState(baseState);

        expect(mockResolver.resolve).toHaveBeenCalledTimes(3);

        expect(mockResolver.resolve).toHaveBeenNthCalledWith(1, baseState, { id: 'base_snap' });
        expect(mockResolver.resolve).toHaveBeenNthCalledWith(2, expect.any(Object), { id: 'overlay_snap' });
        expect(mockResolver.resolve).toHaveBeenNthCalledWith(3, expect.any(Object), { id: 'modal_snap' });
    });
});
