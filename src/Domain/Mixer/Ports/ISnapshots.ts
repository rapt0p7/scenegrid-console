import type { MixerSnapshot } from './IMixerTransitionEngine.js';
import { SnapshotId } from '@shared/Types/Branded.js';
import { DeepReadonly } from '@shared/DeepReadonly.js';

export type ISnapshots = DeepReadonly<Record<SnapshotId, MixerSnapshot>>;
