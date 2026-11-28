import { beforeEach, describe, expect, it } from 'vitest';

import { VoiceListWidget } from '../VoiceListWidget.js';

describe('VoiceListWidget', () => {
    let parent: HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = '';
        document.querySelector('#voice-list-styles')?.remove();
        parent = document.createElement('div');
        document.body.append(parent);
    });

    it('creates DOM structure and injects styles once into document.head', () => {
        new VoiceListWidget(parent);
        new VoiceListWidget(parent);

        const containers = parent.querySelectorAll('.voice-list-container');
        expect(containers).toHaveLength(2);
        expect(containers[0].querySelector('.voice-list-content')).not.toBeNull();

        const styleTags = document.head.querySelectorAll('#voice-list-styles');
        expect(styleTags).toHaveLength(1);
        expect(styleTags[0].textContent).toContain('.vl-hw');
        expect(styleTags[0].textContent).toContain('.vl-virt');
    });

    it('renders empty placeholder when no voices are active', () => {
        const widget = new VoiceListWidget(parent);
        widget.update([]);

        const content = parent.querySelector('.voice-list-content') as HTMLElement;
        expect(content.innerHTML).toBe('<span style="color: #475569;">[No active voices]</span>');
    });

    it('renders hardware and virtual voice badges with distinct classes', () => {
        const widget = new VoiceListWidget(parent);
        widget.update([
            { name: 'kickDrum', isVirtual: false },
            { name: 'ambientPad', isVirtual: true }
        ]);

        const items = parent.querySelectorAll('.vl-item');
        expect(items).toHaveLength(2);
        expect(items[0].classList.contains('vl-hw')).toBe(true);
        expect(items[0].textContent).toBe('kickDrum');
        expect(items[1].classList.contains('vl-virt')).toBe(true);
        expect(items[1].textContent).toBe('ambientPad');
    });

    it('skips rewriting innerHTML when rendered HTML has not changed', () => {
        const widget = new VoiceListWidget(parent);
        const voices = [{ name: 'laser', isVirtual: false }];

        widget.update(voices);
        const content = parent.querySelector('.voice-list-content') as HTMLElement;
        const firstChildBefore = content.firstElementChild;

        widget.update(voices);
        expect(content.firstElementChild).toBe(firstChildBefore);

        widget.update([{ name: 'laser', isVirtual: true }]);
        expect(content.firstElementChild).not.toBe(firstChildBefore);
        expect(content.firstElementChild?.classList.contains('vl-virt')).toBe(true);
    });
});
