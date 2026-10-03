import type { IStreamManifest } from '@domain/Configuration/Ports/IStreamManifest.js';

// oxlint-disable unicorn/prefer-at
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { StreamNode } from '../StreamNode.js';

const localMockManifest: IStreamManifest = {
    isLooping: true,
    chunks: [
        { url: 'chunk_0.aac', trimStartSamples: 1024, durationSamples: 88200 },
        { url: 'chunk_1.aac', trimStartSamples: 1024, durationSamples: 88200 },
        { url: 'chunk_2.aac', trimStartSamples: 1024, durationSamples: 44100 }
    ]
};

class MockAudioBufferSourceNode {
    public buffer: any = null;
    public start = vi.fn();
    public stop = vi.fn();
    public disconnect = vi.fn();
    public connect = vi.fn();
}

describe('StreamNode (Infrastructure Layer)', () => {
    let streamNode: StreamNode;
    let mockContext: any;
    let mockLoader: any;
    let createdNodes: MockAudioBufferSourceNode[] = [];

    beforeEach(() => {
        createdNodes = [];
        mockContext = {
            currentTime: 0,
            sampleRate: 44100,
            createBufferSource: () => {
                const node = new MockAudioBufferSourceNode();
                createdNodes.push(node);
                return node;
            },
            createGain: vi.fn().mockReturnValue({
                connect: vi.fn(),
                disconnect: vi.fn(),
                gain: { value: 1 }
            })
        };

        mockLoader = {
            hasChunk: vi.fn().mockReturnValue(true),
            getChunk: vi.fn().mockReturnValue({ length: 89224 }),
            pause: vi.fn(),
            resume: vi.fn(),
            start: vi.fn(),
            tick: vi.fn(),
            syncTimeline: vi.fn()
        };

        streamNode = new StreamNode(mockContext, mockLoader, localMockManifest);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('3.1: Gapless Scheduling & Padding Bypass', () => {
        it('should bypass codec padding using explicit start(when, offset, duration)', () => {
            streamNode.start(mockContext.currentTime);

            mockContext.currentTime = 1.0;
            streamNode.tick(mockContext.currentTime, 16.66);

            expect(createdNodes.length).toBeGreaterThanOrEqual(2);

            const node0 = createdNodes[0];
            const node1 = createdNodes[1];

            const trimOffsetSec = 1024 / 44100;
            const duration0Sec = 88200 / 44100;

            expect(node0.start).toHaveBeenCalledWith(0, trimOffsetSec, duration0Sec);

            const duration1Sec = 88200 / 44100;
            expect(node1.start).toHaveBeenCalledWith(0 + duration0Sec, trimOffsetSec, duration1Sec);
        });
    });

    describe('3.2: Pause & Resume Mechanics (Composite Math & Epsilon)', () => {
        it('should recreate nodes on resume() using resumeOffset = trimStart + elapsed', () => {
            streamNode.start(mockContext.currentTime);

            mockContext.currentTime = 2.5;
            streamNode.tick(mockContext.currentTime, 16.66);

            streamNode.pause();

            expect(mockLoader.pause).toHaveBeenCalled();

            mockContext.currentTime = 10.0;

            createdNodes.forEach(n => n.start.mockClear());

            streamNode.resume();
            expect(mockLoader.resume).toHaveBeenCalled();
            streamNode.tick(mockContext.currentTime, 16.66);

            const trimOffsetSec = 1024 / 44100;
            const expectedOffset = trimOffsetSec + 0.5;
            const expectedDuration = 1.5;

            const resumedNode = createdNodes[createdNodes.length - 1];

            const startCall = resumedNode.start.mock.calls[0];
            expect(startCall[0]).toBeCloseTo(10.0, 4);
            expect(startCall[1]).toBeCloseTo(expectedOffset, 4);
            expect(startCall[2]).toBeCloseTo(expectedDuration, 4);

            expect((streamNode as any).nextChunkScheduledTime).toBeCloseTo(10.0 + 1.5, 4);
            expect((streamNode as any).isPaused).toBe(false);
        });

        it('should recreate nodes on resume() with partial chunk elapsed', () => {
            streamNode.start(mockContext.currentTime);
            mockContext.currentTime = 0.5;
            streamNode.tick(mockContext.currentTime, 16.66);
            streamNode.pause();

            mockContext.currentTime = 10.0;
            createdNodes.forEach(n => n.start.mockClear());
            streamNode.resume();

            const expectedDuration = 1.5;

            const resumedNode = createdNodes[createdNodes.length - 1];
            const startCall = resumedNode.start.mock.calls[0];
            expect(startCall[2]).toBeCloseTo(expectedDuration, 4);
            expect((streamNode as any).nextChunkScheduledTime).toBeCloseTo(10.0 + 1.5, 4);
        });

        it('should snap to chunk boundary using EPSILON if paused exactly at transition', () => {
            streamNode.start(mockContext.currentTime);

            mockContext.currentTime = 2.000001;
            streamNode.pause();

            mockContext.currentTime = 5.0;
            streamNode.resume();
            streamNode.tick(mockContext.currentTime, 16.66);

            const resumedNode = createdNodes[createdNodes.length - 1];
            const startCall = resumedNode.start.mock.calls[0];

            const trimOffsetSec = 1024 / 44100;
            expect(startCall[1]).toBeCloseTo(trimOffsetSec, 4);
        });
    });

    describe('3.3: Strict Timeline Enforcement during Deadline Underruns', () => {
        it('should output silence but keep timeline close to real-time when chunks arrive late', () => {
            streamNode.start(mockContext.currentTime);

            mockLoader.hasChunk.mockImplementation((index: number) => index === 0);

            mockContext.currentTime = 3.0;
            streamNode.tick(mockContext.currentTime, 16.66);

            createdNodes.forEach(n => n.start.mockClear());

            mockLoader.hasChunk.mockReturnValue(true);
            streamNode.tick(mockContext.currentTime, 16.66);

            const resumedNode = createdNodes[createdNodes.length - 1];
            const startCall = resumedNode.start.mock.calls[0];

            const trimOffsetSec = 1024 / 44100;
            const TICK_DRIFT = 16.66 / 1000;
            const expectedLateOffset = 3.0 - 2.0 - TICK_DRIFT;

            expect(startCall[0]).toBeCloseTo(3.0, 4);
            expect(startCall[1]).toBeCloseTo(trimOffsetSec + expectedLateOffset, 3);
            expect(startCall[2]).toBeCloseTo(2.0 - expectedLateOffset, 3);
        });
    });

    describe('3.4: Basic Getters and Setters', () => {
        it('should return contextSampleRate', () => {
            expect(streamNode.contextSampleRate).toBe(44100);
        });

        it('should handle connect and disconnect', () => {
            const dest = {} as AudioNode;
            streamNode.connect(dest);
            expect(mockContext.createGain().connect).toHaveBeenCalledWith(dest);
            streamNode.disconnect();
            expect(mockContext.createGain().disconnect).toHaveBeenCalled();
        });

        it('should update internalIsLooping via setLoop', () => {
            streamNode.setLoop(false);
            expect((streamNode as any).internalIsLooping).toBe(false);
        });

        it('should return correct logical current time based on playback state', () => {
            expect(streamNode.getLogicalCurrentTime()).toBe(0);

            streamNode.start(0);
            mockContext.currentTime = 5.0;
            expect(streamNode.getLogicalCurrentTime()).toBe(5.0);

            streamNode.pause();
            mockContext.currentTime = 10.0;
            expect(streamNode.getLogicalCurrentTime()).toBe(5.0);
        });

        it('should handle stop by pausing and resetting state', () => {
            streamNode.start(0);
            expect(streamNode.isPlaying).toBe(true);
            streamNode.stop();
            expect(mockLoader.pause).toHaveBeenCalled();
            expect(streamNode.isPlaying).toBe(false);
            expect((streamNode as any).isPaused).toBe(false);
        });

        it('should compute getLogicalCurrentTime correctly with non-zero currentChunkStartTime', () => {
            streamNode.start(0);
            (streamNode as any).currentChunkStartTime = 2.0;
            mockContext.currentTime = 5.0;
            expect(streamNode.getLogicalCurrentTime()).toBe(3.0);
            streamNode.pause();
            expect(streamNode.getLogicalCurrentTime()).toBe(3.0);
        });
    });

    describe('3.5: Edge Cases for Pause and Resume', () => {
        it('should handle pause when future nodes exist but no playhead node matches exactly', () => {
            streamNode.start(0);
            (streamNode as any).scheduledNodes = [
                { source: new MockAudioBufferSourceNode(), index: 2, logicalStartTime: 20.0, absoluteEndTime: 22.0 }
            ];
            mockContext.currentTime = 10.0;
            streamNode.pause();

            expect((streamNode as any).activeChunkIndex).toBe(2);
            expect((streamNode as any).currentChunkStartTime).toBe(20.0);
            expect((streamNode as any).scheduledNodes.length).toBe(0);
        });

        it('should handle pause when no future node matches and stop all scheduled nodes', () => {
            streamNode.start(0);
            const mockSource1 = new MockAudioBufferSourceNode();
            const mockSource2 = new MockAudioBufferSourceNode();
            (streamNode as any).scheduledNodes = [
                { source: mockSource1, index: 1, logicalStartTime: 2.0, absoluteEndTime: 4.0 },
                { source: mockSource2, index: 2, logicalStartTime: 5.0, absoluteEndTime: 7.0 }
            ];
            mockContext.currentTime = 10.0;
            streamNode.pause();

            expect((streamNode as any).scheduledNodes.length).toBe(0);
            expect(mockSource1.stop).toHaveBeenCalled();
            expect(mockSource1.disconnect).toHaveBeenCalled();
            expect(mockSource2.stop).toHaveBeenCalled();
            expect(mockSource2.disconnect).toHaveBeenCalled();
        });

        it('should handle end of manifest during resume (Looping)', () => {
            streamNode.start(0);
            streamNode.pause();

            (streamNode as any).activeChunkIndex = 2;
            (streamNode as any).pauseSnapshotTime = 100.0;
            (streamNode as any).currentChunkStartTime = 0.0;

            streamNode.resume();

            expect((streamNode as any).activeChunkIndex).toBe(1);
        });

        it('should handle end of manifest during resume (Not Looping)', () => {
            streamNode.setLoop(false);
            streamNode.start(0);
            streamNode.pause();

            const endedSpy = vi.fn();
            streamNode.onEnded = endedSpy;

            (streamNode as any).activeChunkIndex = 2;
            (streamNode as any).pauseSnapshotTime = 100.0;
            (streamNode as any).currentChunkStartTime = 0.0;

            streamNode.resume();

            expect(streamNode.isPlaying).toBe(false);
            expect(endedSpy).toHaveBeenCalled();
        });

        it('should handle end of manifest at the end of resume (Not Looping)', () => {
            streamNode.setLoop(false);
            streamNode.start(0);
            streamNode.pause();

            const endedSpy = vi.fn();
            streamNode.onEnded = endedSpy;

            (streamNode as any).activeChunkIndex = 2;
            (streamNode as any).pauseSnapshotTime = 1.5;
            (streamNode as any).currentChunkStartTime = 0.0;

            createdNodes.length = 0;

            streamNode.resume();

            expect(streamNode.isPlaying).toBe(false);
            expect(endedSpy).toHaveBeenCalled();
            expect(createdNodes.length).toBe(0);
        });
    });

    describe('3.6: Buffer Watermark and Scheduling logic', () => {
        it('should not advance if initial buffer is not met and properly hit watermark', () => {
            mockLoader.hasChunk.mockReturnValue(false);
            streamNode.start(mockContext.currentTime);

            mockContext.currentTime = 5.0;
            (streamNode as any).nextChunkScheduledTime = 5.0;
            streamNode.tick(5.0, 16.66);

            expect((streamNode as any).nextChunkScheduledTime).toBeCloseTo(5.0 + 16.66 / 1000, 5);
            expect((streamNode as any).initialBufferMet).toBe(false);

            mockLoader.hasChunk.mockImplementation((idx: number) => idx === 0);
            streamNode.tick(5.0, 16.66);
            expect((streamNode as any).initialBufferMet).toBe(false);

            mockLoader.hasChunk.mockImplementation((idx: number) => idx === 0 || idx === 1);
            streamNode.tick(5.0, 16.66);
            expect((streamNode as any).initialBufferMet).toBe(true);
        });

        it('should increment loadedCount when chunk index is >= length and not looping', () => {
            streamNode.setLoop(false);
            (streamNode as any).activeChunkIndex = 2;
            mockLoader.hasChunk.mockReturnValue(true);

            (streamNode as any).scheduleUpcomingChunks(0, 16);
            expect((streamNode as any).initialBufferMet).toBe(true);
        });

        it('should hit end of manifest in advanceToNextChunkIndex (Looping)', () => {
            streamNode.start(0);
            (streamNode as any).initialBufferMet = true;
            (streamNode as any).activeChunkIndex = 2;

            (streamNode as any).advanceToNextChunkIndex();

            expect((streamNode as any).activeChunkIndex).toBe(0);
        });

        it('should hit end of manifest in advanceToNextChunkIndex (Not Looping)', () => {
            streamNode.setLoop(false);
            streamNode.start(0);
            (streamNode as any).initialBufferMet = true;
            (streamNode as any).activeChunkIndex = 2;

            const endedSpy = vi.fn();
            streamNode.onEnded = endedSpy;

            (streamNode as any).advanceToNextChunkIndex();

            expect(streamNode.isPlaying).toBe(false);
            expect(endedSpy).toHaveBeenCalled();
        });

        it('should strictly observe absoluteEndTime + 1.0 in cleanupFinishedNodes', () => {
            streamNode.start(0);
            const mockSource = new MockAudioBufferSourceNode();
            (streamNode as any).scheduledNodes = [{ source: mockSource, absoluteEndTime: 10.0 }];

            (streamNode as any).cleanupFinishedNodes(11.0);
            expect(mockSource.disconnect).not.toHaveBeenCalled();
            expect((streamNode as any).scheduledNodes.length).toBe(1);

            (streamNode as any).cleanupFinishedNodes(11.01);
            expect(mockSource.disconnect).toHaveBeenCalled();
            expect((streamNode as any).scheduledNodes.length).toBe(0);
        });
    });

    describe('3.7: Branch Coverage Edge Cases', () => {
        it('should handle start() when already playing', () => {
            streamNode.start(0);
            streamNode.start(0);
            expect(mockLoader.start).toHaveBeenCalledTimes(1);
        });

        it('should handle start() without when parameter', () => {
            mockContext.currentTime = 5.0;
            streamNode.start();
            expect((streamNode as any).nextChunkScheduledTime).toBe(7.0);
        });

        it('should handle pause() when not playing or already paused', () => {
            streamNode.pause();
            streamNode.start(0);
            (streamNode as any).scheduledNodes = [];
            streamNode.pause();
            streamNode.pause();
            expect(mockLoader.pause).toHaveBeenCalledTimes(1);
        });

        it('should handle pause() when scheduledNodes are all in the past', () => {
            streamNode.start(0);
            (streamNode as any).scheduledNodes = [
                { source: new MockAudioBufferSourceNode(), index: 1, logicalStartTime: 2.0, absoluteEndTime: 4.0 }
            ];
            mockContext.currentTime = 10.0;
            streamNode.pause();
            expect((streamNode as any).scheduledNodes.length).toBe(0);
        });

        it('should handle resume() when not playing or not paused', () => {
            streamNode.resume(0);
            streamNode.start(0);
            streamNode.resume(0);
            expect(mockLoader.resume).not.toHaveBeenCalled();
        });

        it('should clamp elapsed < 0 to 0 in resume()', () => {
            streamNode.start(0);
            streamNode.pause();
            (streamNode as any).pauseSnapshotTime = -1.0;
            (streamNode as any).currentChunkStartTime = 0.0;
            streamNode.resume(0);
            const resumedNode = createdNodes[createdNodes.length - 1];
            expect(resumedNode).toBeDefined();
        });

        it('should handle tick() when not playing or paused', () => {
            streamNode.tick(0, 16);
            streamNode.start(0);
            streamNode.pause();
            streamNode.tick(0, 16);
            expect(mockLoader.tick).not.toHaveBeenCalled();
        });

        it('should handle tick() if loader syncTimeline is undefined', () => {
            streamNode.start(0);
            mockLoader.syncTimeline = undefined;
            streamNode.tick(0, 16);
            expect(mockLoader.tick).toHaveBeenCalled();
        });

        it('should fallback to 44100 if context.sampleRate is falsy', () => {
            mockContext.sampleRate = 0;
            streamNode.start(0);
            streamNode.pause();
            streamNode.resume(0);
            streamNode.tick(0, 16);
            (streamNode as any).advanceToNextChunkIndex();
            expect((streamNode as any).nextChunkScheduledTime).not.toBeNaN();
        });

        it('should exit scheduleChunk if audioBuffer is null', () => {
            mockLoader.getChunk.mockReturnValue(null);
            streamNode.start(0);
            (streamNode as any).scheduleChunk(0, 0, 0);
            expect(createdNodes.length).toBe(0);
        });

        it('should return from scheduleChunk if actualDuration <= 0 and call connect', () => {
            streamNode.start(0);
            mockLoader.getChunk.mockReturnValue({ length: 1000 });
            mockContext.currentTime = 100.0;
            (streamNode as any).scheduleChunk(0, 0, 0);
            expect(createdNodes.length).toBe(1);

            createdNodes.length = 0; // reset
            mockContext.currentTime = 0.0;
            (streamNode as any).scheduleChunk(0, 0, 2.0);
            expect(createdNodes.length).toBe(0);

            (streamNode as any).scheduleChunk(0, 0, 1.0);
            expect(createdNodes.length).toBe(1);
            expect(createdNodes[0].connect).toHaveBeenCalledWith(streamNode.output);
        });

        it('should handle falsy node in cleanupFinishedNodes', () => {
            streamNode.start(0);
            const arr = [{ absoluteEndTime: 0 }] as any;
            arr.shift = vi.fn().mockImplementation(() => {
                arr.length = 0;
                return undefined;
            });
            (streamNode as any).scheduledNodes = arr;

            expect(() => {
                (streamNode as any).cleanupFinishedNodes(3.0);
            }).not.toThrow();
        });

        it('should handle nextChunkScheduledTime > currentTimeSec in initialBufferMet=false branch', () => {
            mockLoader.hasChunk.mockReturnValue(false);
            streamNode.start(0);
            (streamNode as any).nextChunkScheduledTime = 10.0;
            streamNode.tick(5.0, 16);
            expect((streamNode as any).nextChunkScheduledTime).toBe(10.0);
        });

        it('should handle nextChunkScheduledTime > currentTimeSec in scheduleUpcomingChunks', () => {
            mockLoader.hasChunk.mockReturnValue(false);
            streamNode.start(0);
            (streamNode as any).initialBufferMet = true;
            (streamNode as any).nextChunkScheduledTime = 10.0;
            streamNode.tick(5.0, 16);

            (streamNode as any).nextChunkScheduledTime = 5.5;

            streamNode.tick(5.0, 16);
            expect((streamNode as any).nextChunkScheduledTime).toBe(5.5);
        });
    });
});
