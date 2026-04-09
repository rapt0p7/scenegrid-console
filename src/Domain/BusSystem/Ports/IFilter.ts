export type AudioFilterType =
    | 'lowpass'
    | 'highpass'
    | 'bandpass'
    | 'lowshelf'
    | 'highshelf'
    | 'peaking'
    | 'notch'
    | 'allpass';

export type IFilter = IBiquadConfig | IReverbConfig;

export interface IBiquadConfig {
    type: AudioFilterType;
    frequency: number;
    Q?: number;
}

export interface IReverbConfig {
    type: 'reverb';
    reverbTime?: number;
    reverbDecay?: number;
    frequency?: never;
}
