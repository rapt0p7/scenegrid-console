export interface IFilterConfig {
    type: BiquadFilterType;
    frequency: number;
    Q?: number;
    gain?: number;
}

export interface IReverbFilterConfig {
    type: 'reverb';
    reverbTime?: number;
    reverbDecay?: number;
    frequency?: never;
}
