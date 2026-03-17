export type IFilter = IBiquadConfig | IReverbConfig;

export interface IBiquadConfig {
    type: BiquadFilterType;
    frequency: number;
    Q?: number;
}

export interface IReverbConfig {
    type: 'reverb';
    reverbTime?: number;
    reverbDecay?: number;
    frequency?: never;
}
