import { Milliseconds, IGlobalRTPCParameterConfig } from '@scene-grid/engine';

export default {
    kickType: {
        defaultValue: 0,
        attack: 0 as Milliseconds,
        release: 0 as Milliseconds
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    music_phase: {
        defaultValue: 0,
        attack: 0 as Milliseconds,
        release: 0 as Milliseconds
    }
} satisfies Record<string, IGlobalRTPCParameterConfig>;
