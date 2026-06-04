// noinspection D

import { createFrequencyCurveWithRMS, createMeters } from './visualizers.js';

import type { AudioCtx, GainNodeLike, AudioBusSystem } from '@scene-grid/engine';

export interface DebuggerOptions {
    wrapperSelector?: string;
}

export default class AudioDebugger {
    private readonly context: AudioCtx;
    private readonly busSystem: AudioBusSystem;
    private readonly masterNode: GainNodeLike;

    constructor(context: AudioCtx, busSystem: AudioBusSystem, masterNode: GainNodeLike) {
        this.context = context;
        this.busSystem = busSystem;
        this.masterNode = masterNode;
    }

    // oxlint-disable-next-line max-lines-per-function
    public async init(options: DebuggerOptions = {}): Promise<void> {
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
            busesToAnalyze.push({ name: busId, node: bus.analyzerTapNode });
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

        const promises = [];
        for (const item of uiColumns) {
            if (!item) continue;

            promises.push(
                createFrequencyCurveWithRMS(
                    item.specContainer,
                    item.node,
                    window.screen.availWidth / uiColumns.length - 4
                )
            );

            promises.push(
                createMeters(item.meterContainer, item.node, window.screen.availWidth / uiColumns.length - 4)
            );
        }

        await Promise.all(promises);
    }
}
