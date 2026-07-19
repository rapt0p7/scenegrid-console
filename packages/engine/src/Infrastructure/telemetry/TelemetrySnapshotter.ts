import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type { ISwitchHistoryRegistry } from '@domain/Managers/Ports/ISwitchHistoryRegistry.js';
import type {
    ITelemetrySnapshot,
    IRtpcSnapshot,
    IPlaybackSnapshot,
    ISwitchSnapshot,
    SoundId,
    GameParamId,
    BusId,
    IBusSnapshot,
    IMusicTrackSnapshot,
    Milliseconds
} from '@scene-grid/shared';
import { isDefined } from '@scene-grid/shared';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';

export class TelemetrySnapshotter implements ITickable {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public TICK_RATE: Milliseconds = 100 as Milliseconds;
    private lastSnapshotTimeMs: number = 0;
    private readonly snapshotDto: ITelemetrySnapshot;
    private readonly rtpcPool: IRtpcSnapshot[];
    private readonly switchPool: ISwitchSnapshot[];
    private readonly playbackPool: IPlaybackSnapshot[];
    private readonly busPool: IBusSnapshot[];

    constructor(
        private readonly dispatcher: ITelemetryDispatcher,
        private readonly soundController: ISoundController,
        private readonly rtpcAdapter: IRTPCAdapter,
        private readonly busSystem: IAudioBusSystem,
        private readonly switchRegistry: ISwitchHistoryRegistry,
        private readonly sequencer: ISequencer,
        private readonly rtpcKeys: GameParamId[],
        private readonly switchKeys: SoundId[],
        private readonly busKeys: BusId[],
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
            isVirtual: false,
            virtualReason: undefined
        }));

        this.busPool = Array.from({ length: busKeys.length }, () => ({
            busId: '' as BusId,
            logicalGain: 1,
            rtpcGain: 1,
            finalGain: 1,
            sidechainGain: 1,
            activeModifiers: [
                { type: '', value: 0, source: '' },
                { type: '', value: 0, source: '' },
                { type: '', value: 0, source: '' }
            ],
            modifiersCount: 0
        }));

        this.snapshotDto = {
            type: 'SNAPSHOT',
            timestampMs: 0,
            rtpcs: [],
            switches: [],
            activePlaybacks: [],
            buses: [],
            musicTracks: []
        };
    }

    public tick(currentTimeSec: number, _deltaTime: Milliseconds): void {
        const currentTimeMs = currentTimeSec * 1000;

        if (currentTimeMs - this.lastSnapshotTimeMs < this.TICK_RATE) {
            return;
        }
        this.lastSnapshotTimeMs = currentTimeMs;

        // oxlint-disable-next-line typescript/no-explicit-any
        (this.snapshotDto as any).timestampMs = currentTimeMs;
        this.collectRtpcs(this.snapshotDto.rtpcs);
        this.collectSwitches(this.snapshotDto.switches);
        this.collectBuses(this.snapshotDto.buses);
        this.collectPlaybacks(this.snapshotDto.activePlaybacks);
        this.collectMusicTracks(this.snapshotDto.musicTracks);

        this.dispatcher.dispatch(this.snapshotDto);
    }

    private collectMusicTracks(out: IMusicTrackSnapshot[]): void {
        const snapshots = this.sequencer.getMusicSnapshot() ?? [];
        const length = snapshots.length;

        for (let i = 0; i < length; i++) {
            out[i] = snapshots[i];
        }

        out.length = length;
    }

    private collectBuses(out: IBusSnapshot[]): void {
        const length = this.busKeys.length;

        for (let i = 0; i < length; i++) {
            const busId = this.busKeys[i];
            const poolItem = this.busPool[i];

            const logical = this.busSystem.getBusLogicalGain(busId) ?? 1;
            const rtpc = this.busSystem.getBusRtpcGain(busId) ?? 1;
            const final = this.busSystem.getBusFinalGain(busId) ?? 1;
            const sidechainGain = this.busSystem.getSidechainGain(busId);
            // oxlint-disable-next-line typescript/no-explicit-any
            const count = (this.busSystem as any).fillActiveModifiers?.(busId, poolItem.activeModifiers) ?? 0;

            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).busId = busId;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).logicalGain = logical;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).rtpcGain = rtpc;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).finalGain = final;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).sidechainGain = sidechainGain;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).modifiersCount = count;

            out[i] = poolItem;
        }

        out.length = length;
    }

    private collectRtpcs(out: IRtpcSnapshot[]): void {
        const length = this.rtpcKeys.length;

        for (let i = 0; i < length; i++) {
            const param = this.rtpcKeys[i];
            const poolItem = this.rtpcPool[i];

            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).param = param;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).value = this.rtpcAdapter.getValue(param) ?? 0;

            out[i] = poolItem;
        }

        out.length = length;
    }

    private collectSwitches(out: ISwitchSnapshot[]): void {
        let activeCount = 0;
        const length = this.switchKeys.length;

        for (let i = 0; i < length; i++) {
            const switchId = this.switchKeys[i];
            const state = this.switchRegistry.getHistory(switchId);

            if (isDefined(state?.currentSwitchKey)) {
                const poolItem = this.switchPool[activeCount];
                // oxlint-disable-next-line typescript/no-explicit-any
                (poolItem as any).switchId = switchId;
                // oxlint-disable-next-line typescript/no-explicit-any
                (poolItem as any).currentKey = state.currentSwitchKey;

                out[activeCount++] = poolItem;
            }
        }

        out.length = activeCount;
    }

    private collectPlaybacks(out: IPlaybackSnapshot[]): void {
        const activeIds = this.soundController.getActivePlaybacks();
        let activeCount = 0;
        const limit = this.playbackPool.length;

        for (let i = 0; i < activeIds.length; i++) {
            if (activeCount >= limit) break;

            const id = activeIds[i];
            const soundId = this.soundController.getSoundId(id);
            if (!soundId) continue;

            const state = this.soundController.getPlaybackState(id);
            const isVirtual = state === 'virtual';
            const poolItem = this.playbackPool[activeCount];
            // oxlint-disable-next-line typescript/no-explicit-any
            const virtualReason = isVirtual ? (this.soundController as any).getVirtualReason?.(id) : undefined;

            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).playbackId = id;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).soundId = soundId;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).isVirtual = isVirtual;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).positionSec = this.soundController.getPlaybackPositionSec?.(id) ?? 0;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).volume = this.soundController.getCurrentVolume?.(id) ?? 1;
            // oxlint-disable-next-line typescript/no-explicit-any
            (poolItem as any).virtualReason = virtualReason;

            out[activeCount++] = poolItem;
        }

        out.length = activeCount;
    }
}
