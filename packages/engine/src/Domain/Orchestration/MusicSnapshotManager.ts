import { LoopState, TrackContext } from '@domain/Orchestration/Ports/ISequencer.js';
import { SoundId, IMusicTrackSnapshot } from '@scene-grid/shared';

type MutableMusicSnapshot = {
    -readonly [K in keyof IMusicTrackSnapshot]: IMusicTrackSnapshot[K];
};

export default class MusicSnapshotManager {
    private readonly snapshotPool: MutableMusicSnapshot[] = [];
    private readonly activeSnapshots: IMusicTrackSnapshot[] = [];

    public getMusicSnapshot(tracks: Map<SoundId, TrackContext>): readonly IMusicTrackSnapshot[] {
        let count = 0;

        tracks.forEach((track, soundId) => {
            if (track.state === LoopState.IDLE) return;

            if (count >= this.snapshotPool.length) {
                this.snapshotPool.push({
                    soundId: '' as SoundId,
                    state: 'IDLE',
                    currentRegion: null,
                    targetRegion: null,
                    queueLength: 0
                });
            }

            const snap = this.snapshotPool.at(count)!;

            snap.soundId = soundId;
            snap.state = track.state;
            snap.currentRegion = track.currentRegion;
            snap.targetRegion = track.regionQueue.length > 0 ? track.regionQueue.at(0)!.name : null;
            snap.queueLength = track.regionQueue.length;

            if (count >= this.activeSnapshots.length) {
                this.activeSnapshots.push(snap);
            }

            count++;
        });

        this.activeSnapshots.length = count;

        return this.activeSnapshots;
    }
}
