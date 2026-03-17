// noinspection D

import AudioMotionAnalyzer from 'audiomotion-analyzer';

import { createFrequencyCurveWithRMS, createMeters } from '../helpers/visualizers';

import type { IAudioBusSystem } from '../interfaces/IAudioBusSystem';
import type { AudioCtx, GainNodeLike } from '@webaudio-core';

export interface DebuggerOptions {
    wrapperSelector?: string;
    isUseAnalyzer?: boolean;
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
        const { wrapperSelector = '#wrapper', isUseAnalyzer = false } = options;

        const wrapper = document.querySelector(wrapperSelector);
        if (!wrapper) {
            console.warn(`[AudioDebugger] Wrapper element "${wrapperSelector}" not found.`);
            return;
        }

        wrapper.innerHTML = '';

        const busesToAnalyze = [{ name: 'Master', node: this.masterNode }];

        const activeBuses = this.busSystem.getAllBuses();
        for (const [busId, bus] of activeBuses.entries()) {
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

                let canvas = null;
                if (isUseAnalyzer) {
                    canvas = document.createElement('canvas');
                }

                return {
                    node: bus.node,
                    specContainer: specBox,
                    meterContainer: meterBox,
                    canvas
                };
            })
            .filter(Boolean);

        requestAnimationFrame(async () => {
            for (const item of uiColumns) {
                if (!item) continue;

                if (isUseAnalyzer) {
                    // @ts-ignore
                    new AudioMotionAnalyzer(item.specContainer, {
                        audioCtx: this.context as any,
                        source: item.node as any,
                        // @ts-ignore
                        canvas: item.canvas,
                        connectSpeakers: false,
                        mode: 0,
                        fftSize: 8192,
                        frequencyScale: 'log',
                        minDecibels: -90,
                        maxDecibels: -20,
                        smoothing: 0.4,
                        showPeaks: true,
                        peakHoldTime: 450,
                        peakFadeTime: 600,
                        gradient: 'classic',
                        mirror: 0,
                        maxFPS: 60
                    });
                } else {
                    await createFrequencyCurveWithRMS(
                        item.specContainer as any,
                        item.node as any,
                        window.screen.availWidth / uiColumns.length - 4
                    );
                }

                await createMeters(
                    item.meterContainer as any,
                    item.node as any,
                    window.screen.availWidth / uiColumns.length - 4
                );
            }
        });
    }
}
