// oxlint-disable typescript/no-unsafe-type-assertion
import type { IMusicFSMConfig } from '@scene-grid/engine';
import type { GameParamId, Milliseconds, MusicStateId, RegionId, SoundId } from '@scene-grid/shared';

// eslint-disable-next-line @typescript-eslint/naming-convention
const MusicFSM: IMusicFSMConfig = {
    initialState: 'phase_A' as MusicStateId,
    globalEdges: [],
    states: {
        ['phase_A' as MusicStateId]: {
            id: 'phase_A' as MusicStateId,
            soundId: 'smartLoop' as SoundId,
            sequencerRegion: 'A' as RegionId,
            edges: [
                {
                    targetState: 'phase_B' as MusicStateId,
                    conditions: [{ param: 'music_phase' as GameParamId, operator: '==', value: 2 }],
                    syncRule: 'NextBar',
                    crossfadeDuration: 4000 as Milliseconds,
                    transitionRegionName: 'A_TO_B' as RegionId,
                    interruptable: true
                },
                {
                    targetState: 'phase_C' as MusicStateId,
                    conditions: [{ param: 'music_phase' as GameParamId, operator: '==', value: 3 }],
                    syncRule: 'NextBar',
                    crossfadeDuration: 4000 as Milliseconds,
                    transitionRegionName: 'A_TO_C' as RegionId,
                    interruptable: true
                }
            ]
        },
        ['phase_B' as MusicStateId]: {
            id: 'phase_B' as MusicStateId,
            soundId: 'smartLoop' as SoundId,
            sequencerRegion: 'B' as RegionId,
            edges: [
                {
                    targetState: 'phase_A' as MusicStateId,
                    conditions: [{ param: 'music_phase' as GameParamId, operator: '==', value: 1 }],
                    syncRule: 'NextBar',
                    crossfadeDuration: 4000 as Milliseconds,
                    transitionRegionName: 'B_TO_A' as RegionId,
                    interruptable: true
                },
                {
                    targetState: 'phase_C' as MusicStateId,
                    conditions: [{ param: 'music_phase' as GameParamId, operator: '==', value: 3 }],
                    syncRule: 'NextBar',
                    crossfadeDuration: 4000 as Milliseconds,
                    transitionRegionName: 'B_TO_C' as RegionId,
                    interruptable: true
                }
            ]
        },
        ['phase_C' as MusicStateId]: {
            id: 'phase_C' as MusicStateId,
            soundId: 'smartLoop' as SoundId,
            sequencerRegion: 'C' as RegionId,
            edges: [
                {
                    targetState: 'phase_A' as MusicStateId,
                    conditions: [{ param: 'music_phase' as GameParamId, operator: '==', value: 1 }],
                    syncRule: 'NextBar',
                    crossfadeDuration: 4000 as Milliseconds,
                    transitionRegionName: 'C_TO_A' as RegionId,
                    interruptable: true
                },
                {
                    targetState: 'phase_B' as MusicStateId,
                    conditions: [{ param: 'music_phase' as GameParamId, operator: '==', value: 2 }],
                    syncRule: 'NextBar',
                    crossfadeDuration: 4000 as Milliseconds,
                    transitionRegionName: 'C_TO_B' as RegionId,
                    interruptable: true
                }
            ]
        }
    }
};

export default MusicFSM;
