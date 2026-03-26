import type { PannerConfig } from '@webaudio-core/nodes/AudioNodeFactory';

export interface ISoundOptions {
    url: string | string[];
    volume?: number;
    rate?: number;
    detune?: number;
    loop?: boolean;
    loopStart?: number;
    loopEnd?: number;
    fadeIn?: number;
    fadeOut?: number;
    spatial?: PannerConfig | boolean;
    cooldownMs?: number;
}
