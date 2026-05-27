import type { MixerSnapshot } from './IMixerTransitionEngine.js';
import type { SnapshotId } from '@shared/Types/Branded.js';
import type { DeepReadonly } from '@shared/DeepReadonly.js';

export type ISnapshots = DeepReadonly<Record<SnapshotId, MixerSnapshot>>;
