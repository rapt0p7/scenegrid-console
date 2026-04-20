/* eslint-disable @typescript-eslint/naming-convention */
export type PlaybackId = number & { readonly __brand: unique symbol };

export type SoundId = string & { readonly __brand: unique symbol };

export type BusId = string & { readonly __brand: unique symbol };

export type SnapshotId = string & { readonly __brand: unique symbol };

export type LayerId = string & { readonly __brand: unique symbol };
