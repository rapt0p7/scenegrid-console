import { describe, it, expect, beforeEach } from 'vitest';

import { VoiceMeterWidget } from '../VoiceMeterWidget.js';

describe('VoiceMeterWidget', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.append(container);
    });

    it('should initialize with 0 / maxVoices', () => {
        new VoiceMeterWidget(container, 32);
        const label = container.querySelector('.vm-value') as HTMLElement;
        expect(label.textContent).toBe('0 / 32');
    });

    it('should update label and bars for hardware and virtual voices', () => {
        const widget = new VoiceMeterWidget(container, 32);
        widget.update(1, 2);

        const label = container.querySelector('.vm-value') as HTMLElement;
        expect(label.textContent).toBe('3 / 32 (HW: 1)');

        const hwBar = container.querySelector('.vm-bar-hw') as HTMLElement;
        const virtualBar = container.querySelector('.vm-bar-virtual') as HTMLElement;

        // 1/32 = 3.125%, 100 - 3.125% = 96.875%
        expect(hwBar.style.clipPath).toBe('inset(0 96.875% 0 0)');
        // 3/32 = 9.375%, 100 - 9.375% = 90.625%
        expect(virtualBar.style.clipPath).toBe('inset(0 90.625% 0 0)');
    });

    it('should handle zero and non-finite values safely', () => {
        const widget = new VoiceMeterWidget(container, 32);
        widget.update(Number.NaN, undefined as any);

        const label = container.querySelector('.vm-value') as HTMLElement;
        expect(label.textContent).toBe('0 / 32 (HW: 0)');
    });

    it('should default max to 32 when maxVoices is 0', () => {
        const widget = new VoiceMeterWidget(container, 0);
        widget.update(1, 0);

        const label = container.querySelector('.vm-value') as HTMLElement;
        expect(label.textContent).toBe('1 / 0 (HW: 1)');
    });
});
