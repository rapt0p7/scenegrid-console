/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D

import type { IStreamManifest } from '@domain/Configuration/Ports/IStreamManifest.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';

export interface IChunkedLoaderOptions {
    readonly absoluteFloorSeconds?: number;
    readonly ttlMs?: number;
    readonly maxRetries?: number;
}

export class ChunkedLoader implements ITickable {
    private manifest: IStreamManifest | null = null;
    private readonly absoluteFloorSeconds: number;
    private readonly ttlMs: number;
    private readonly maxRetries: number;

    private readonly decodedBuffers = new Map<number, AudioBuffer>();
    private readonly inFlightFetches = new Set<number>();

    private isPlaying = false;
    private isPaused = true;
    private activeChunkIndex = 0;
    private currentChunkStartTime = 0;

    private pausedDurationMs = 0;

    private zombieDetected = false;
    private lastSeenAudioTime = -1;
    private consecutiveStalledTicks = 0;

    private retryCount = 0;
    private backoffTimerMs = 0;
    private pendingRetryChunkIndex: number | null = null;

    constructor(
        private readonly context: AudioContext,
        private readonly telemetry?: ITelemetryDispatcher,
        options: IChunkedLoaderOptions = {}
    ) {
        this.absoluteFloorSeconds = options.absoluteFloorSeconds ?? 2.0;
        this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
        this.maxRetries = options.maxRetries ?? 3;
    }

    public loadManifest(manifest: IStreamManifest): void {
        this.manifest = manifest;
        this.resetState();
    }

    public start(): void {
        if (!this.manifest || this.manifest.chunks.length === 0) return;

        this.isPlaying = true;
        this.isPaused = false;
        this.activeChunkIndex = 0;
        this.currentChunkStartTime = this.context.currentTime;
        this.retryCount = 0;
        this.backoffTimerMs = 1000;

        this.triggerFetch(0);

        this.evaluateLookahead(this.context.currentTime);
    }

    public pause(_currentTime?: number): void {
        this.isPaused = true;
        this.pausedDurationMs = 0;
    }

    public resume(currentTime?: number): void {
        const resumeAudioTime = currentTime ?? this.context.currentTime;

        if (this.context.state === 'closed') {
            this.reinitialize();
            this.isPaused = false;
            return;
        }

        this.isPaused = false;
        this.pausedDurationMs = 0;
        this.retryCount = 0;
        this.backoffTimerMs = 0;

        this.lastSeenAudioTime = resumeAudioTime;
        this.consecutiveStalledTicks = 0;
        this.zombieDetected = false;

        if (this.decodedBuffers.size === 0 && this.manifest) {
            this.triggerFetch(this.activeChunkIndex);
        }
    }

    public tick(currentTimeSec: number, physicalDeltaMs: number): void {
        if (!this.manifest || !this.isPlaying) return;

        if (this.isPaused) {
            this.pausedDurationMs += physicalDeltaMs;
            if (this.pausedDurationMs >= this.ttlMs) {
                this.flushQueue();
            }
            return;
        }

        if (this.context.state === 'suspended') {
            return;
        }

        if (this.context.state === 'running' && physicalDeltaMs > 0) {
            if (currentTimeSec === this.lastSeenAudioTime) {
                this.consecutiveStalledTicks++;
                if (this.consecutiveStalledTicks >= 3) {
                    this.zombieDetected = true;
                    this.flushQueue();
                    this.reinitialize();
                    return;
                }
            } else {
                this.consecutiveStalledTicks = 0;
                this.lastSeenAudioTime = currentTimeSec;
            }
        }

        const isCurrentReady = this.decodedBuffers.has(this.activeChunkIndex);
        if (!isCurrentReady) {
            this.handleUnderrunDeadline(currentTimeSec, physicalDeltaMs);
            return;
        }

        this.evaluateLookahead(currentTimeSec);
    }

    public getDecodedQueueSize(): number {
        return this.decodedBuffers.size;
    }

    public isZombieStateDetected(): boolean {
        return this.zombieDetected;
    }

    public getRetryCount(): number {
        return this.retryCount;
    }

    public getChunk(index: number): AudioBuffer | undefined {
        return this.decodedBuffers.get(index);
    }

    public hasChunk(index: number): boolean {
        return this.decodedBuffers.has(index);
    }

    public flushQueue(): void {
        this.decodedBuffers.clear();
        this.inFlightFetches.clear();
    }

    public syncTimeline(streamNodeActiveIndex: number, scheduledStartTime: number): void {
        if (streamNodeActiveIndex !== this.activeChunkIndex) {
            for (const key of this.decodedBuffers.keys()) {
                if (key < streamNodeActiveIndex && !(streamNodeActiveIndex === 0 && key > 0)) {
                    this.decodedBuffers.delete(key);
                }
            }
            this.activeChunkIndex = streamNodeActiveIndex;
        }
        this.currentChunkStartTime = scheduledStartTime;
    }

    // oxlint-disable-next-line no-unused-vars
    private evaluateLookahead(currentTimeSec: number): void {
        if (!this.manifest) return;

        const PRELOAD_CHUNKS = 4;

        for (let i = 0; i <= PRELOAD_CHUNKS; i++) {
            let targetIndex = this.activeChunkIndex + i;

            if (targetIndex >= this.manifest.chunks.length) {
                if (this.manifest.isLooping) {
                    targetIndex = targetIndex % this.manifest.chunks.length;
                } else {
                    continue;
                }
            }

            if (!this.decodedBuffers.has(targetIndex) && !this.inFlightFetches.has(targetIndex)) {
                this.triggerFetch(targetIndex);
                break;
            }

            if (this.inFlightFetches.has(targetIndex)) {
                break;
            }
        }
    }

    private triggerFetch(index: number): void {
        if (!this.manifest || this.decodedBuffers.has(index) || this.inFlightFetches.has(index)) {
            return;
        }

        const chunk = this.manifest.chunks[index];
        this.inFlightFetches.add(index);

        void (async () => {
            try {
                const response = await fetch(chunk.url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

                this.decodedBuffers.set(index, audioBuffer);
                this.inFlightFetches.delete(index);
                this.retryCount = 0;
            } catch {
                this.inFlightFetches.delete(index);
                this.pendingRetryChunkIndex = index;
            }
        })();
    }

    private handleUnderrunDeadline(currentTimeSec: number, physicalDeltaMs: number): void {
        if (this.inFlightFetches.has(this.activeChunkIndex)) {
            return;
        }

        if (this.retryCount >= this.maxRetries) {
            return;
        }

        this.backoffTimerMs -= physicalDeltaMs;

        if (this.backoffTimerMs <= 0) {
            this.retryCount++;

            if (this.retryCount >= this.maxRetries) {
                this.telemetry?.dispatch({
                    type: 'CAUSE_CHAIN',
                    timestampMs: currentTimeSec * 1000,
                    initiator: { type: 'STREAM_LOADER', reason: 'audio_stream_underrun_fatal' },
                    result: { type: 'FATAL_UNDERRUN', target: 'chunk_underrun' }
                });
            } else {
                this.backoffTimerMs = 1000 * Math.pow(2, this.retryCount);
                const targetIndex = this.pendingRetryChunkIndex ?? this.activeChunkIndex;
                this.triggerFetch(targetIndex);
            }
        }
    }

    private reinitialize(): void {
        this.flushQueue();
        this.retryCount = 0;
        this.backoffTimerMs = 0;
        this.pendingRetryChunkIndex = null;
    }

    private resetState(): void {
        this.reinitialize();
        this.isPlaying = false;
        this.isPaused = true;
        this.activeChunkIndex = 0;
        this.currentChunkStartTime = 0;
    }
}
