/* eslint-disable @typescript-eslint/naming-convention */
export type PlaybackId = number & { readonly __brand: unique symbol };

export type SoundId = string & { readonly __brand: unique symbol };

export type BusId = string & { readonly __brand: unique symbol };

export type SnapshotId = string & { readonly __brand: unique symbol };

export type LayerId = string & { readonly __brand: unique symbol };

export type RegionId = string & { readonly __brand: unique symbol };

export type GameParamId = string & { readonly __brand: unique symbol };

export type TickerTaskId = string & { readonly __brand: unique symbol };

export type EventId = string & { readonly __brand: unique symbol };

export type BankId = string & { readonly __brand: unique symbol };

export type MusicStateId = string & { readonly __brand: unique symbol };

export type ContextTime = number & { readonly __brand: unique symbol };

export type Seconds = number & { readonly __brand: unique symbol };

export type Milliseconds = number & { readonly __brand: unique symbol };

export type Samples = number & { readonly __brand: unique symbol };

export type BPM = number & { readonly __brand: unique symbol };

export type Beats = number & { readonly __brand: unique symbol };

export type Pulses = number & { readonly __brand: unique symbol };
