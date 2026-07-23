import type { MixerSnapshot } from './IMixerTransitionEngine.js';
import type { SnapshotId, DeepReadonly } from '@scene-grid/shared';

export type ISnapshot = MixerSnapshot;

export type ISnapshots = DeepReadonly<Record<SnapshotId, ISnapshot>>;
