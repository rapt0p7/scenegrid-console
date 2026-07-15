// oxlint-disable typescript/no-unsafe-type-assertion
import type {
    IMusicFSMConfig,
    GameParamId,
    MusicStateId,
    RegionId,
    SoundId,
    ConditionOperator,
    QuantizeType
} from '@scene-grid/engine';

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
                    conditions: [
                        { param: 'music_phase' as GameParamId, operator: '==' as ConditionOperator, value: 2 }
                    ],
                    syncRule: 'NextBar' as QuantizeType,
                    crossfadeDurationMs: 4000,
                    transitionRegionName: 'A_TO_B' as RegionId,
                    interruptable: true
                },
                {
                    targetState: 'phase_C' as MusicStateId,
                    conditions: [
                        { param: 'music_phase' as GameParamId, operator: '==' as ConditionOperator, value: 3 }
                    ],
                    syncRule: 'NextBar' as QuantizeType,
                    crossfadeDurationMs: 4000,
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
                    conditions: [
                        { param: 'music_phase' as GameParamId, operator: '==' as ConditionOperator, value: 1 }
                    ],
                    syncRule: 'NextBar' as QuantizeType,
                    crossfadeDurationMs: 4000,
                    transitionRegionName: 'B_TO_A' as RegionId,
                    interruptable: true
                },
                {
                    targetState: 'phase_C' as MusicStateId,
                    conditions: [
                        { param: 'music_phase' as GameParamId, operator: '==' as ConditionOperator, value: 3 }
                    ],
                    syncRule: 'NextBar' as QuantizeType,
                    crossfadeDurationMs: 4000,
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
                    conditions: [
                        { param: 'music_phase' as GameParamId, operator: '==' as ConditionOperator, value: 1 }
                    ],
                    syncRule: 'NextBar' as QuantizeType,
                    crossfadeDurationMs: 4000,
                    transitionRegionName: 'C_TO_A' as RegionId,
                    interruptable: true
                },
                {
                    targetState: 'phase_B' as MusicStateId,
                    conditions: [
                        { param: 'music_phase' as GameParamId, operator: '==' as ConditionOperator, value: 2 }
                    ],
                    syncRule: 'NextBar' as QuantizeType,
                    crossfadeDurationMs: 4000,
                    transitionRegionName: 'C_TO_B' as RegionId,
                    interruptable: true
                }
            ]
        }
    }
};

export default MusicFSM;
