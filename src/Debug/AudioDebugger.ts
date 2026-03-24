// noinspection D

import { createFrequencyCurveWithRMS, createMeters } from '../helpers/visualizers';

import type { IAudioBusSystem } from '../interfaces/IAudioBusSystem';
import type { AudioCtx, GainNodeLike } from '@webaudio-core';

export interface DebuggerOptions {
    wrapperSelector?: string;
}

export default class AudioDebugger {
    private readonly context: AudioCtx;
    private readonly busSystem: IAudioBusSystem;
    private readonly masterNode: GainNodeLike;

    constructor(context: AudioCtx, busSystem: IAudioBusSystem, masterNode: GainNodeLike) {
        this.context = context;
        this.busSystem = busSystem;
        this.masterNode = masterNode;
    }

    public init(options: DebuggerOptions = {}): void {
        const { wrapperSelector = '#wrapper' } = options;

        const wrapper = document.querySelector(wrapperSelector);
        if (!wrapper) {
            console.warn(`[AudioDebugger] Wrapper element "${wrapperSelector}" not found.`);
            return;
        }

        wrapper.innerHTML = '';

        const busesToAnalyze = [{ name: 'Master', node: this.masterNode }];

        const activeBuses = this.busSystem.getAllBuses();
        for (const [busId, bus] of activeBuses.entries()) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            busesToAnalyze.push({ name: busId, node: bus.postFilterGain });
        }

        const uiColumns = busesToAnalyze
            .map(bus => {
                if (!bus.node) return null;

                const col = document.createElement('div');
                col.className = 'bus-column';

                const title = document.createElement('div');
                title.className = 'bus-title';
                title.textContent = bus.name;

                const specBox = document.createElement('div');
                specBox.className = 'spectrum-box eq-bg';

                const meterBox = document.createElement('div');
                meterBox.className = 'meter-box';

                col.append(title, specBox, meterBox);
                wrapper.append(col);

                return {
                    node: bus.node,
                    specContainer: specBox,
                    meterContainer: meterBox
                };
            })
            .filter(Boolean);

        requestAnimationFrame(async () => {
            for (const item of uiColumns) {
                if (!item) continue;

                await createFrequencyCurveWithRMS(
                    item.specContainer as any,
                    item.node as any,
                    window.screen.availWidth / uiColumns.length - 4
                );

                await createMeters(
                    item.meterContainer as any,
                    item.node as any,
                    window.screen.availWidth / uiColumns.length - 4
                );
            }
        });
    }
}
