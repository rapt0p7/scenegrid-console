// oxlint-disable no-underscore-dangle
import type { IStreamManifest } from '@domain/Configuration/Ports/IStreamManifest.js';

import { ContextTime, Milliseconds, Seconds } from '@scene-grid/shared';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { StreamNode } from '../../nodes/StreamNode.js';

import { StreamInstance } from '../StreamInstance.js';

const mockManifest: IStreamManifest = {
    isLooping: false,
    chunks: [
        { url: 'chunk_0.aac', trimStartSamples: 0, durationSamples: 44100 },
        { url: 'chunk_1.aac', trimStartSamples: 0, durationSamples: 44100 }
    ]
};

class MockStreamNode {
    public output = {
        gain: {
            value: 1,
            linearRampToValueAtTime: vi.fn(),
            cancelScheduledValues: vi.fn()
        },
        connect: vi.fn(),
        disconnect: vi.fn()
    };
    public context = { currentTime: 10 };
    public isPlaying = false;
    public contextSampleRate = 44100;
    public onEnded?: () => void;

    public start = vi.fn();
    public stop = vi.fn();
    public pause = vi.fn();
    public resume = vi.fn();
    public setLoop = vi.fn();
    public connect = vi.fn();
    public disconnect = vi.fn();
    public getLogicalCurrentTime = vi.fn().mockReturnValue(1.5);
    public tick = vi.fn();
}

describe('StreamInstance (Infrastructure Layer)', () => {
    let mockStreamNode: MockStreamNode;
    let streamInstance: StreamInstance;

    beforeEach(() => {
        mockStreamNode = new MockStreamNode();
        streamInstance = new StreamInstance(mockStreamNode as unknown as StreamNode, mockManifest);
    });

    it('should expose audio properties and gain parameter correctly', () => {
        expect(streamInstance.gainParam).toBe(mockStreamNode.output.gain);
        expect(streamInstance.playbackRate).toBe(1);
        expect(streamInstance.currentTime).toBe(1.5);
        expect(mockStreamNode.getLogicalCurrentTime).toHaveBeenCalled();
    });

    it('should calculate total duration from manifest chunks and sample rate', () => {
        expect(streamInstance.duration).toBe(2.0);
    });

    it('should reflect playing and stopped states correctly', () => {
        expect(streamInstance.state).toBe('stopped');

        mockStreamNode.isPlaying = true;
        expect(streamInstance.state).toBe('playing');
    });

    it('should delegate control methods to StreamNode', () => {
        streamInstance.play(10 as ContextTime, 0 as Seconds, 0 as Seconds);
        expect(mockStreamNode.start).toHaveBeenCalledWith(10);

        streamInstance.pause();
        expect(mockStreamNode.pause).toHaveBeenCalled();

        streamInstance.resume();
        expect(mockStreamNode.resume).toHaveBeenCalled();

        streamInstance.setLoop(true);
        expect(mockStreamNode.setLoop).toHaveBeenCalledWith(true);
    });

    it('should handle virtualize and devirtualize by disconnecting/reconnecting the audio graph', () => {
        const destination = {} as AudioNode;
        streamInstance.connectTo(destination);

        streamInstance.virtualize();
        expect(streamInstance.state).toBe('virtual');
        expect(mockStreamNode.pause).not.toHaveBeenCalled();
        expect(mockStreamNode.disconnect).toHaveBeenCalled();

        streamInstance.devirtualize();
        expect(streamInstance.state).toBe('stopped');
        expect(mockStreamNode.resume).not.toHaveBeenCalled();
        expect(mockStreamNode.connect).toHaveBeenCalledWith(destination);
    });

    it('should handle stop by invoking stop and emitting ended event', () => {
        const endedCallback = vi.fn();
        streamInstance.on('ended', endedCallback);

        streamInstance.stop();

        expect(mockStreamNode.stop).toHaveBeenCalled();
        expect(endedCallback).toHaveBeenCalledWith(streamInstance);
    });

    it('should trigger ended event when StreamNode signals completion', () => {
        const endedCallback = vi.fn();
        streamInstance.on('ended', endedCallback);

        expect(mockStreamNode.onEnded).toBeDefined();
        mockStreamNode.onEnded!();

        expect(endedCallback).toHaveBeenCalledWith(streamInstance);
    });

    it('should handle routing connection methods', () => {
        const destination = {} as AudioNode;
        streamInstance.connectTo(destination);
        expect(mockStreamNode.connect).toHaveBeenCalledWith(destination);

        streamInstance.disconnectRoute();
        expect(mockStreamNode.disconnect).toHaveBeenCalled();
    });
    describe('Edge Cases and Properties', () => {
        it('should initialize _poolIndex to -1 and id to UNKNOWN_STREAM', () => {
            expect(streamInstance._poolIndex).toBe(-1);
            expect(streamInstance.id).toBe('UNKNOWN_STREAM');
        });

        it('should initialize isLooping from manifest and expose it via getter', () => {
            expect(streamInstance.isLooping).toBe(false);
        });

        it('should always return null for pannerNode', () => {
            expect(streamInstance.pannerNode).toBeNull();
        });

        it('should ignore setRate calls (No-op)', () => {
            expect(() => {
                streamInstance.setRate(1.5);
            }).not.toThrow();
            expect(streamInstance.playbackRate).toBe(1);
        });

        it('should safely ignore setPosition calls (No-op)', () => {
            expect(() => {
                streamInstance.setPosition(10, 20, 30);
            }).not.toThrow();
        });

        it('should rebind by updating the instance ID', () => {
            streamInstance.rebind('new_id' as any, {} as any);
            expect(streamInstance.id).toBe('new_id');
        });

        it('should fallback to 44100 sample rate in duration if streamNode.contextSampleRate is falsy', () => {
            const originalRate = mockStreamNode.contextSampleRate;
            mockStreamNode.contextSampleRate = 0;
            expect(streamInstance.duration).toBe(2.0);
            mockStreamNode.contextSampleRate = originalRate;
        });

        it('should reuse existing Set when adding a second listener for the same event type', () => {
            const spy1 = vi.fn();
            const spy2 = vi.fn();
            const unsubscribe1 = streamInstance.on('ended', spy1);
            streamInstance.on('ended', spy2);

            unsubscribe1();

            streamInstance.stop();
            expect(spy1).not.toHaveBeenCalled();
            expect(spy2).toHaveBeenCalled();
        });
    });

    describe('Automation & Ticking', () => {
        it('should forward tick() to StreamNode', () => {
            streamInstance.tick(123.4, 16.6);
            expect(mockStreamNode.tick).toHaveBeenCalledWith(123.4, 16.6);
        });

        it('should apply linear ramp to gainParam on automate() when target is gain', () => {
            streamInstance.automate('gain', 0.5, 100 as Milliseconds);
            expect(mockStreamNode.output.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 10 + 0.1);
        });

        it('should ignore automate() calls for non-gain targets', () => {
            streamInstance.automate('pitch', 1.5, 100 as Milliseconds);
            expect(mockStreamNode.output.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
        });

        it('should cancel scheduled gain values on cancelScheduled()', () => {
            streamInstance.cancelScheduled();
            expect(mockStreamNode.output.gain.cancelScheduledValues).toHaveBeenCalledWith(10);
        });

        it('should call cancelScheduled() on resetForReuse()', () => {
            const cancelSpy = vi.spyOn(streamInstance, 'cancelScheduled');
            streamInstance.resetForReuse();
            expect(cancelSpy).toHaveBeenCalled();
        });
    });

    describe('Lifecycle & Virtualization edge cases', () => {
        it('should execute forceNaturalEnd() if virtual and emit ended', () => {
            const endedSpy = vi.fn();
            streamInstance.on('ended', endedSpy);

            streamInstance.virtualize();
            expect(streamInstance.state).toBe('virtual');

            streamInstance.forceNaturalEnd();

            expect(streamInstance.state).toBe('stopped');
            expect(endedSpy).toHaveBeenCalledWith(streamInstance);
        });

        it('should ignore forceNaturalEnd() if not virtual', () => {
            const endedSpy = vi.fn();
            streamInstance.on('ended', endedSpy);

            streamInstance.forceNaturalEnd();

            expect(endedSpy).not.toHaveBeenCalled();
        });

        it('should devirtualize safely even if no currentDestination is set', () => {
            streamInstance.virtualize();
            streamInstance.devirtualize();

            expect(streamInstance.state).toBe('stopped');
            expect(mockStreamNode.connect).not.toHaveBeenCalled();
        });

        it('should fully clean up on dispose()', () => {
            const disposedSpy = vi.fn();
            streamInstance.on('disposed', disposedSpy);

            streamInstance.dispose();

            expect(mockStreamNode.stop).toHaveBeenCalled();
            expect(disposedSpy).toHaveBeenCalledWith(streamInstance);

            disposedSpy.mockClear();
            (streamInstance as any).emit('disposed', streamInstance);
            expect(disposedSpy).not.toHaveBeenCalled();
        });
    });
});
