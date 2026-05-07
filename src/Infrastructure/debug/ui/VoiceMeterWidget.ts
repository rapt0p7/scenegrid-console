// oxlint-disable max-lines-per-function
export class VoiceMeterWidget {
    private readonly container: HTMLElement;
    private readonly hwBar: HTMLElement;
    private readonly virtualBar: HTMLElement;
    private readonly label: HTMLElement;
    private readonly maxVoices: number;

    constructor(parentContainer: HTMLElement, maxVoices: number = 32) {
        this.maxVoices = maxVoices;
        this.container = document.createElement('div');
        this.container.className = 'voice-meter-container';

        this.container.innerHTML = `
            <div class="vm-header">
                <span class="vm-title">Voice Count</span>
                <span class="vm-value">0 / ${maxVoices}</span>
            </div>
            <div class="vm-track" style="--max-voices: ${maxVoices}">
                <div class="vm-bar vm-bar-virtual"></div>
                <div class="vm-bar vm-bar-hw"></div>
                <div class="vm-ticks"></div>
            </div>
            <div class="vm-legend">
                <span style="color: #4ade80">● HW (Playing)</span>
                <span style="color: #64748b">● Virtual (Culled)</span>
            </div>
        `;

        this.hwBar = this.container.querySelector('.vm-bar-hw') as HTMLElement;
        this.virtualBar = this.container.querySelector('.vm-bar-virtual') as HTMLElement;
        this.label = this.container.querySelector('.vm-value') as HTMLElement;

        parentContainer.append(this.container);
        this.injectStyles();
    }

    public update(hwActive: number, virtualCulled: number): void {
        const total = hwActive + virtualCulled;

        const hwRatio = Math.min(hwActive / this.maxVoices, 1);
        const totalRatio = Math.min(total / this.maxVoices, 1);

        this.hwBar.style.clipPath = `inset(0 ${100 - hwRatio * 100}% 0 0)`;
        this.virtualBar.style.clipPath = `inset(0 ${100 - totalRatio * 100}% 0 0)`;

        this.label.textContent = `${total} / ${this.maxVoices} (HW: ${hwActive})`;
    }

    private injectStyles(): void {
        if (document.querySelector('#voice-meter-styles')) return;

        const style = document.createElement('style');
        style.id = 'voice-meter-styles';
        style.textContent = `
            .voice-meter-container {
                padding: 8px;
                font-family: 'Inter', sans-serif;
                font-size: 11px;
                color: #b1b1b1;
            }
            .vm-header, .vm-legend {
                display: flex;
                justify-content: space-between;
                margin-bottom: 6px;
            }
            .vm-legend {
                margin-top: 6px;
                font-size: 10px;
                justify-content: flex-start;
                gap: 12px;
            }
            .vm-track {
                position: relative;
                width: 100%;
                height: 14px;
                background: #151618;
                border-radius: 2px;
                overflow: hidden;
            }
            .vm-bar {
                position: absolute;
                top: 0; left: 0;
                height: 100%;
                width: 100%;
                clip-path: inset(0 100% 0 0);
                transition: clip-path 0.05s linear;
                will-change: clip-path;
            }
            .vm-bar-hw {
                background: linear-gradient(90deg, #4ade80 0%, #eab308 65%, #ef4444 100%);
                z-index: 2;
            }
            .vm-bar-virtual {
                background: #475569;
                z-index: 1;
            }
            .vm-ticks {
                position: absolute;
                top: 0; left: 0; width: 100%; height: 100%;
                z-index: 3;
                background: repeating-linear-gradient(
                    to right,
                    transparent,
                    transparent calc(100% / var(--max-voices) - 1px),
                    rgba(0, 0, 0, 0.4) calc(100% / var(--max-voices) - 1px),
                    rgba(0, 0, 0, 0.4) calc(100% / var(--max-voices))
                );
            }
        `;
        document.head.append(style);
    }
}
