// noinspection D

import type { IStreamManifest } from '@domain/Configuration/Ports/IStreamManifest.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';

import type { ChunkedLoader } from '../loader/ChunkedLoader.js';

const EPSILON = 0.00001;

interface IScheduledNode {
    readonly source: AudioBufferSourceNode;
    readonly index: number;
    readonly logicalStartTime: number;
    readonly absoluteEndTime: number;
}

export class StreamNode implements ITickable {
    public readonly output: GainNode;
    public isPlaying = false;
    public onEnded?: () => void;

    private internalIsLooping: boolean;
    private isPaused = false;

    private initialBufferMet = false;
    private readonly BUFFER_WATERMARK = 2;

    private activeChunkIndex = 0;
    private nextChunkScheduledTime = 0;
    private pauseSnapshotTime = 0;
    private currentChunkStartTime = 0;

    private scheduledNodes: IScheduledNode[] = [];

    constructor(
        public readonly context: AudioContext,
        private readonly loader: ChunkedLoader,
        private readonly manifest: IStreamManifest
    ) {
        this.output = this.context.createGain();
        this.internalIsLooping = manifest.isLooping;
    }

    public get contextSampleRate(): number {
        return this.context.sampleRate;
    }

    public connect(destination: AudioNode): void {
        this.output.connect(destination);
    }

    public setLoop(loop: boolean): void {
        this.internalIsLooping = loop;
    }

    public getLogicalCurrentTime(): number {
        if (!this.isPlaying) return 0;
        if (this.isPaused) return this.pauseSnapshotTime - this.currentChunkStartTime;
        return this.context.currentTime - this.currentChunkStartTime;
    }

    public disconnect(): void {
        this.output.disconnect();
    }

    // oxlint-disable-next-line no-unused-vars
    public stop(timeToStop?: number): void {
        this.pause();
        this.isPlaying = false;
        this.isPaused = false;
    }

    public start(when?: number): void {
        if (this.isPlaying && !this.isPaused) return;

        this.isPlaying = true;
        this.isPaused = false;

        this.activeChunkIndex = 0;
        this.nextChunkScheduledTime = when ?? this.context.currentTime;

        this.loader.start();
        this.scheduleUpcomingChunks(this.context.currentTime, 0);
    }

    public pause(): void {
        if (!this.isPlaying || this.isPaused) return;

        this.isPaused = true;
        this.pauseSnapshotTime = this.context.currentTime;

        this.loader.pause(this.pauseSnapshotTime);

        const playheadNode = this.scheduledNodes.find(
            n => this.pauseSnapshotTime >= n.logicalStartTime && this.pauseSnapshotTime <= n.absoluteEndTime
        );

        if (playheadNode) {
            this.activeChunkIndex = playheadNode.index;
            this.currentChunkStartTime = playheadNode.logicalStartTime;
        } else if (this.scheduledNodes.length > 0) {
            const futureNode = this.scheduledNodes.find(n => n.logicalStartTime >= this.pauseSnapshotTime);
            if (futureNode) {
                this.activeChunkIndex = futureNode.index;
                this.currentChunkStartTime = futureNode.logicalStartTime;
            }
        }

        for (let i = 0; i < this.scheduledNodes.length; i++) {
            try {
                this.scheduledNodes[i].source.stop();
                this.scheduledNodes[i].source.disconnect();
            } catch {}
        }
        this.scheduledNodes.length = 0;
    }

    public resume(when?: number): void {
        if (!this.isPlaying || !this.isPaused) return;

        const resumeTime = when ?? this.context.currentTime;
        this.isPaused = false;

        this.loader.resume(resumeTime);

        const sampleRate = this.context.sampleRate || 44100;
        let elapsed = this.pauseSnapshotTime - this.currentChunkStartTime;
        if (elapsed < 0) elapsed = 0;

        const targetChunk = this.manifest.chunks[this.activeChunkIndex];
        const durationSec = targetChunk.durationSamples / sampleRate;

        if (Math.abs(elapsed - durationSec) < EPSILON || elapsed >= durationSec) {
            elapsed = 0;
            this.activeChunkIndex++;
            if (this.activeChunkIndex >= this.manifest.chunks.length) {
                if (this.internalIsLooping) this.activeChunkIndex = 0;
                else {
                    this.isPlaying = false;
                    this.onEnded?.();
                    return;
                }
            }
        }

        const activeDurationSec = this.manifest.chunks[this.activeChunkIndex].durationSamples / sampleRate;
        const remainingSec = activeDurationSec - elapsed;

        this.scheduleChunk(this.activeChunkIndex, resumeTime, elapsed);

        this.activeChunkIndex++;
        if (this.activeChunkIndex >= this.manifest.chunks.length) {
            if (this.internalIsLooping) this.activeChunkIndex = 0;
            else {
                this.isPlaying = false;
                this.onEnded?.();
            }
        }

        this.nextChunkScheduledTime = resumeTime + remainingSec;

        this.scheduleUpcomingChunks(resumeTime, 0);
    }

    public tick(currentTimeSec: number, physicalDeltaMs: number): void {
        if (!this.isPlaying || this.isPaused) return;

        if ((this.loader as any).syncTimeline) {
            (this.loader as any).syncTimeline(this.activeChunkIndex, this.nextChunkScheduledTime);
        }

        this.loader.tick(currentTimeSec, physicalDeltaMs);

        this.cleanupFinishedNodes(currentTimeSec);
        this.scheduleUpcomingChunks(currentTimeSec, physicalDeltaMs);
    }

    private scheduleUpcomingChunks(currentTimeSec: number, physicalDeltaMs: number): void {
        if (this.activeChunkIndex >= this.manifest.chunks.length) return;

        const sampleRate = this.context.sampleRate || 44100;
        const currentChunk = this.manifest.chunks[this.activeChunkIndex];
        const durationSec = currentChunk.durationSamples / sampleRate;

        const lookAheadWindow = Math.max(durationSec * 0.5, 0.5);

        if (!this.initialBufferMet) {
            let loadedCount = 0;
            for (let i = 0; i < this.BUFFER_WATERMARK; i++) {
                let checkIdx = this.activeChunkIndex + i;
                if (checkIdx >= this.manifest.chunks.length && !this.internalIsLooping) {
                    loadedCount++;
                } else {
                    if (this.internalIsLooping) checkIdx = checkIdx % this.manifest.chunks.length;
                    if (this.loader.hasChunk(checkIdx)) loadedCount++;
                }
            }

            if (loadedCount >= Math.min(this.BUFFER_WATERMARK, this.manifest.chunks.length)) {
                this.initialBufferMet = true;
            } else {
                if (this.nextChunkScheduledTime <= currentTimeSec) {
                    this.nextChunkScheduledTime += physicalDeltaMs / 1000;
                }
                return;
            }
        }

        if (this.nextChunkScheduledTime - currentTimeSec <= lookAheadWindow) {
            if (this.loader.hasChunk(this.activeChunkIndex)) {
                this.scheduleChunk(this.activeChunkIndex, this.nextChunkScheduledTime, 0);
                this.advanceToNextChunkIndex();
            } else if (this.nextChunkScheduledTime <= currentTimeSec) {
                // Shift the scheduled time forward to prevent the late-drop cascade.
                // Without this, on a very slow network a chunk arriving 30s late would produce
                // lateOffset > durationSec, causing scheduleChunk to return with actualDuration<=0,
                // and advanceToNextChunkIndex would then silently skip it — cascading through all
                // subsequent chunks until the timeline catches real time again.
                this.nextChunkScheduledTime += physicalDeltaMs / 1000;
            }
        }
    }

    private scheduleChunk(chunkIndex: number, scheduledWhen: number, logicalOffsetSec: number): void {
        const audioBuffer = this.loader.getChunk(chunkIndex);
        if (!audioBuffer) return;

        const chunk = this.manifest.chunks[chunkIndex];
        const sampleRate = this.context.sampleRate || 44100;

        const baseDurationSec = chunk.durationSamples / sampleRate;
        const trimOffsetSec = chunk.trimStartSamples / sampleRate;

        const now = this.context.currentTime;
        let actualWhen = scheduledWhen;
        let lateOffset = 0;

        if (actualWhen < now) {
            lateOffset = now - actualWhen;
            actualWhen = now;
        }

        const totalLogicalOffset = logicalOffsetSec + lateOffset;
        const actualDuration = baseDurationSec - totalLogicalOffset;

        if (actualDuration <= 0) return;

        const physicalOffset = trimOffsetSec + totalLogicalOffset;

        const source = this.context.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.output);

        source.start(actualWhen, physicalOffset, actualDuration);

        const logicalStartTime = actualWhen - totalLogicalOffset;
        const absoluteEndTime = actualWhen + actualDuration;

        this.scheduledNodes.push({
            source,
            index: chunkIndex,
            logicalStartTime,
            absoluteEndTime
        });
    }

    private advanceToNextChunkIndex(): void {
        const sampleRate = this.context.sampleRate || 44100;
        const currentChunk = this.manifest.chunks[this.activeChunkIndex];
        const durationSec = currentChunk.durationSamples / sampleRate;

        this.nextChunkScheduledTime += durationSec;
        this.activeChunkIndex++;

        if (this.activeChunkIndex >= this.manifest.chunks.length) {
            if (this.internalIsLooping) {
                this.activeChunkIndex = 0;
            } else {
                this.isPlaying = false;
                this.onEnded?.();
            }
        }
    }

    private cleanupFinishedNodes(currentTimeSec: number): void {
        while (this.scheduledNodes.length > 0) {
            const nodeInfo = this.scheduledNodes[0];

            if (currentTimeSec > nodeInfo.absoluteEndTime + 1.0) {
                const node = this.scheduledNodes.shift();
                if (node) {
                    try {
                        node.source.disconnect();
                    } catch {}
                }
            } else {
                break;
            }
        }
    }
}
