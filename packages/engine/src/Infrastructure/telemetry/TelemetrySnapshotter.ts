import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ISwitchHistoryRegistry } from '@domain/Managers/Ports/ISwitchHistoryRegistry.js';
import type {
    ITelemetrySnapshot,
    IRtpcSnapshot,
    IPlaybackSnapshot,
    ISwitchSnapshot,
    SoundId,
    GameParamId
} from '@scene-grid/shared';
import { isDefined } from '@scene-grid/shared';

export class TelemetrySnapshotter implements ITickable {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public TICK_RATE_MS: number = 100;
    private lastSnapshotTimeMs: number = 0;
    private readonly snapshotDto: ITelemetrySnapshot;
    private readonly rtpcPool: IRtpcSnapshot[];
    private readonly switchPool: ISwitchSnapshot[];
    private readonly playbackPool: IPlaybackSnapshot[];

    constructor(
        private readonly dispatcher: ITelemetryDispatcher,
        private readonly soundController: ISoundController,
        private readonly rtpcAdapter: IRTPCAdapter,
        private readonly switchRegistry: ISwitchHistoryRegistry,
        private readonly rtpcKeys: GameParamId[],
        private readonly switchKeys: SoundId[],
        private readonly maxPlaybacks: number = 128
    ) {
        this.rtpcPool = Array.from({ length: rtpcKeys.length }, () => ({ param: '' as GameParamId, value: 0 }));
        this.switchPool = Array.from({ length: switchKeys.length }, () => ({
            switchId: '' as SoundId,
            currentKey: null
        }));
        this.playbackPool = Array.from({ length: maxPlaybacks }, () => ({
            playbackId: 0 as any,
            soundId: '' as SoundId,
            positionSec: 0,
            volume: 0,
            isVirtual: false
        }));

        this.snapshotDto = {
            type: 'SNAPSHOT',
            timestampMs: 0,
            rtpcs: [],
            switches: [],
            activePlaybacks: []
        };
    }

    public tick(currentTimeSec: number, _deltaTimeMs: number): void {
        const currentTimeMs = currentTimeSec * 1000;

        if (currentTimeMs - this.lastSnapshotTimeMs < this.TICK_RATE_MS) {
            return;
        }
        this.lastSnapshotTimeMs = currentTimeMs;

        // oxlint-disable-next-line typescript/no-explicit-any
        (this.snapshotDto as any).timestampMs = currentTimeMs;
        // oxlint-disable-next-line typescript/no-explicit-any
        (this.snapshotDto as any).rtpcs = this.collectRtpcs();
        // oxlint-disable-next-line typescript/no-explicit-any
        (this.snapshotDto as any).switches = this.collectSwitches();
        // oxlint-disable-next-line typescript/no-explicit-any
        (this.snapshotDto as any).activePlaybacks = this.collectPlaybacks();

        this.dispatcher.dispatch(this.snapshotDto);
    }

    private collectRtpcs(): IRtpcSnapshot[] {
        const length = this.rtpcKeys.length;
        for (let i = 0; i < length; i++) {
            const param = this.rtpcKeys[i];
            const poolItem = this.rtpcPool[i];

            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).param = param;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).value = this.rtpcAdapter.getValue(param) ?? 0;
        }
        return this.rtpcPool;
    }

    private collectSwitches(): ISwitchSnapshot[] {
        let activeCount = 0;
        const length = this.switchKeys.length;

        for (let i = 0; i < length; i++) {
            const switchId = this.switchKeys[i];
            const state = this.switchRegistry.getHistory(switchId);

            if (isDefined(state?.currentSwitchKey)) {
                const poolItem = this.switchPool[activeCount++];
                // oxlint-disable-next-line typescript/no-explicit-any
                (poolItem as any).switchId = switchId;
                // oxlint-disable-next-line typescript/no-explicit-any
                (poolItem as any).currentKey = state.currentSwitchKey;
            }
        }

        return activeCount === this.switchPool.length ? this.switchPool : this.switchPool.slice(0, activeCount);
    }

    private collectPlaybacks(): IPlaybackSnapshot[] {
        const activeIds = this.soundController.getActivePlaybacks();
        const length = activeIds.length;
        let activeCount = 0;

        for (let i = 0; i < length; i++) {
            if (activeCount >= this.playbackPool.length) break;

            const id = activeIds[i];
            const soundId = this.soundController.getSoundId(id);
            if (!soundId) continue;

            const state = this.soundController.getPlaybackState(id);
            const poolItem = this.playbackPool[activeCount++];

            const controller = this.soundController;

            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).playbackId = id;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).soundId = soundId;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).isVirtual = state === 'virtual';

            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).positionSec = controller.getPlaybackPositionSec
                ? controller.getPlaybackPositionSec(id)
                : 0;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).volume = controller.getCurrentVolume ? controller.getCurrentVolume(id) : 1;
        }

        return activeCount === this.playbackPool.length ? this.playbackPool : this.playbackPool.slice(0, activeCount);
    }
}
