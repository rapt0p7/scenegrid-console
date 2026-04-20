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
    readonly type: AudioFilterType;
    readonly frequency: number;
    readonly Q?: number;
}

export interface IReverbConfig {
    readonly type: 'reverb';
    readonly reverbTime?: number;
    readonly reverbDecay?: number;
    readonly frequency?: never;
}
