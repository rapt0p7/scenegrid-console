export interface SceneGridRegistry {}

type ExtractRegistry<K extends string> = K extends keyof SceneGridRegistry ? SceneGridRegistry[K] : string;

export type AutocompleteSound = ExtractRegistry<'SoundIds'> | (string & {});
export type AutocompleteEvent = ExtractRegistry<'EventIds'> | (string & {});
export type AutocompleteBank = ExtractRegistry<'BankIds'> | (string & {});
export type AutocompleteSnapshot = ExtractRegistry<'SnapshotIds'> | (string & {});
export type AutocompleteGameParam = ExtractRegistry<'GameParamIds'> | (string & {});
