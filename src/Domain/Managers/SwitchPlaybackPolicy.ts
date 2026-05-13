import type { ISwitchSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { SoundId } from '@shared/Types/Branded.js';
import { isDefined } from '@shared/guards.js';

export default class SwitchPlaybackPolicy {
    public evaluate(config: ISwitchSoundConfig, currentValue?: string | number): SoundId | null {
        const switches = config.switches;

        if (isDefined(currentValue)) {
            const key = String(currentValue);

            if (key in switches) {
                return switches[key];
            }
        }

        return config.defaultSwitch ?? null;
    }
}
