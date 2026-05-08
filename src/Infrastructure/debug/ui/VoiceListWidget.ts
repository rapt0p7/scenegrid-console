export class VoiceListWidget {
    private readonly container: HTMLElement;
    private readonly contentBox: HTMLElement;

    constructor(parentContainer: HTMLElement) {
        this.container = document.createElement('div');
        this.container.className = 'voice-list-container';

        this.contentBox = document.createElement('div');
        this.contentBox.className = 'voice-list-content';

        this.container.append(this.contentBox);
        parentContainer.append(this.container);

        this.injectStyles();
    }

    public update(voices: Array<{ name: string; isVirtual: boolean }>): void {
        if (voices.length === 0) {
            this.contentBox.innerHTML = '<span style="color: #475569;">[No active voices]</span>';
            return;
        }

        const html = voices
            .map(v => {
                const cssClass = v.isVirtual ? 'vl-virt' : 'vl-hw';
                return `<span class="vl-item ${cssClass}">${v.name}</span>`;
            })
            .join('');

        if (this.contentBox.innerHTML !== html) {
            this.contentBox.innerHTML = html;
        }
    }

    private injectStyles(): void {
        if (document.querySelector('#voice-list-styles')) return;

        const style = document.createElement('style');
        style.id = 'voice-list-styles';
        style.textContent = `
            .voice-list-container {
                margin: 4px 8px 8px 8px;
                padding: 6px;
                background: #151618;
                border: 1px solid #2c2d2f;
                border-radius: 2px;
                max-height: 85px;
                overflow-y: auto;
            }
            .voice-list-content {
                font-family: 'Inter', sans-serif;
                font-size: 10px;
                line-height: 1.5;
                display: flex;
                flex-wrap: wrap;
                gap: 4px 8px;
            }
            .vl-item {
                background: rgba(255, 255, 255, 0.05);
                padding: 1px 4px;
                border-radius: 2px;
                white-space: nowrap;
            }
            .vl-hw { color: #4ade80; }
            .vl-virt { color: #64748b; }

            .voice-list-container::-webkit-scrollbar { width: 4px; }
            .voice-list-container::-webkit-scrollbar-track { background: transparent; }
            .voice-list-container::-webkit-scrollbar-thumb { background: #3b3c3e; border-radius: 2px; }
        `;
        document.head.append(style);
    }
}
