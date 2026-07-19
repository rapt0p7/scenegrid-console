/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';

import { CommandReceiver } from '../CommandReceiver.js';
import { BroadcastIpcAdapter } from '../BroadcastIpcAdapter.js';

import type { IInspectorDebugPort } from '@domain/Shared/Ports/IInspectorDebugPort.js';
import type {
    InspectorCommand,
    EventId,
    SnapshotId,
    GameParamId,
    SoundId,
    RegionId,
    Milliseconds
} from '@scene-grid/shared';

vi.mock('../BroadcastIpcAdapter.js', () => {
    return {
        BroadcastIpcAdapter: vi.fn()
    };
});

describe('CommandReceiver', () => {
    let mockEnginePort: Mocked<IInspectorDebugPort>;
    let mockSubscribe: ReturnType<typeof vi.fn>;
    let mockDispose: ReturnType<typeof vi.fn>;
    let receiver: CommandReceiver;
    let simulateIpcMessage: (cmd: InspectorCommand) => void;

    beforeEach(() => {
        mockEnginePort = {
            fireEvent: vi.fn(),
            applySnapshot: vi.fn(),
            setRtpcOverride: vi.fn(),
            stopAll: vi.fn(),
            pauseAll: vi.fn(),
            resumeAll: vi.fn(),
            clearAllOverrides: vi.fn(),
            setSwitchOverride: vi.fn(),
            playLoop: vi.fn(),
            stopLoop: vi.fn(),
            transitionMusicTo: vi.fn()
        };

        mockSubscribe = vi.fn().mockImplementation(cb => {
            simulateIpcMessage = cb;
        });
        mockDispose = vi.fn();

        vi.mocked(BroadcastIpcAdapter).mockImplementation(function () {
            // oxlint-disable-next-line typescript/strict-void-return
            return {
                subscribe: mockSubscribe,
                dispose: mockDispose,
                send: vi.fn()
            } as unknown as BroadcastIpcAdapter<InspectorCommand>;
        });

        receiver = new CommandReceiver(mockEnginePort);
    });

    describe('Initialization & Lifecycle', () => {
        it('should subscribe to the transport on instantiation', () => {
            expect(mockSubscribe).toHaveBeenCalledTimes(1);
            expect(mockSubscribe).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should dispose the transport when dispose() is called', () => {
            receiver.dispose();
            expect(mockDispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('Queue Processing (tick)', () => {
        it('should return early and do nothing if the queue is empty', () => {
            receiver.tick(1, 16);
            expect(mockEnginePort.fireEvent).not.toHaveBeenCalled();
        });

        it('should process a batch of commands in order and clear the queue', () => {
            simulateIpcMessage({ type: 'STOP_ALL' } as unknown as InspectorCommand);

            simulateIpcMessage({
                type: 'FIRE_EVENT',
                timestampMs: 0,
                eventId: 'event_1' as EventId
            });
            simulateIpcMessage({
                type: 'CLEAR_ALL_OVERRIDES',
                timestampMs: 0
            });

            receiver.tick(1, 16);

            expect(mockEnginePort.fireEvent).toHaveBeenCalledWith('event_1');
            expect(mockEnginePort.clearAllOverrides).toHaveBeenCalledTimes(1);
            mockEnginePort.fireEvent.mockClear();
            receiver.tick(2, 16);
            expect(mockEnginePort.fireEvent).not.toHaveBeenCalled();
        });
    });

    describe('Command Routing (processCommand)', () => {
        it('should handle FIRE_EVENT', () => {
            simulateIpcMessage({ type: 'FIRE_EVENT', timestampMs: 0, eventId: 'boom' as EventId });
            receiver.tick(1, 16);
            expect(mockEnginePort.fireEvent).toHaveBeenCalledWith('boom');
        });

        it('should handle APPLY_SNAPSHOT with and without fadeTime', () => {
            simulateIpcMessage({ type: 'APPLY_SNAPSHOT', timestampMs: 0, snapshotId: 'snap1' as SnapshotId });
            receiver.tick(1, 16);
            expect(mockEnginePort.applySnapshot).toHaveBeenCalledWith('snap1', undefined);

            simulateIpcMessage({
                type: 'APPLY_SNAPSHOT',
                timestampMs: 0,
                snapshotId: 'snap2' as SnapshotId,
                fadeTime: 500 as Milliseconds
            });
            receiver.tick(2, 16);
            expect(mockEnginePort.applySnapshot).toHaveBeenCalledWith('snap2', 500);
        });

        it('should handle SET_RTPC', () => {
            simulateIpcMessage({
                type: 'SET_RTPC',
                timestampMs: 0,
                param: 'health' as GameParamId,
                value: 50,
                isOverride: true
            });
            receiver.tick(1, 16);
            expect(mockEnginePort.setRtpcOverride).toHaveBeenCalledWith('health', 50, true);
        });

        it('should handle SET_SWITCH', () => {
            simulateIpcMessage({
                type: 'SET_SWITCH',
                timestampMs: 0,
                switchId: 'surface' as SoundId,
                currentKey: 'metal',
                isOverride: false
            });
            receiver.tick(1, 16);
            expect(mockEnginePort.setSwitchOverride).toHaveBeenCalledWith('surface', 'metal', false);
        });

        it('should handle PLAY_LOOP', () => {
            simulateIpcMessage({
                type: 'PLAY_LOOP',
                timestampMs: 0,
                soundId: 'bgm_track' as SoundId,
                regionName: 'intro' as RegionId
            });
            receiver.tick(1, 16);
            expect(mockEnginePort.playLoop).toHaveBeenCalledWith('bgm_track', 'intro');
        });

        it('should handle STOP_LOOP', () => {
            simulateIpcMessage({
                type: 'STOP_LOOP',
                timestampMs: 0,
                soundId: 'bgm_track' as SoundId
            });
            receiver.tick(1, 16);
            expect(mockEnginePort.stopLoop).toHaveBeenCalledWith('bgm_track');
        });

        it('should handle TRANSITION_MUSIC with optional parameters', () => {
            const mockOptions = { quantize: 'NextBar' } as const;
            simulateIpcMessage({
                type: 'TRANSITION_MUSIC',
                timestampMs: 0,
                soundId: 'bgm_track' as SoundId,
                targetRegion: 'chorus' as RegionId,
                transitionRegionName: 'fill' as RegionId,
                options: mockOptions
            } as any);
            receiver.tick(1, 16);
            expect(mockEnginePort.transitionMusicTo).toHaveBeenCalledWith('bgm_track', 'chorus', 'fill', mockOptions);
        });

        it('should handle GLOBAL_ACTION: STOP_ALL', () => {
            simulateIpcMessage({ type: 'GLOBAL_ACTION', timestampMs: 0, action: 'STOP_ALL' });
            receiver.tick(1, 16);
            expect(mockEnginePort.stopAll).toHaveBeenCalledTimes(1);
        });

        it('should handle GLOBAL_ACTION: PAUSE_ALL', () => {
            simulateIpcMessage({ type: 'GLOBAL_ACTION', timestampMs: 0, action: 'PAUSE_ALL' });
            receiver.tick(1, 16);
            expect(mockEnginePort.pauseAll).toHaveBeenCalledTimes(1);
        });

        it('should handle GLOBAL_ACTION: RESUME_ALL', () => {
            simulateIpcMessage({ type: 'GLOBAL_ACTION', timestampMs: 0, action: 'RESUME_ALL' });
            receiver.tick(1, 16);
            expect(mockEnginePort.resumeAll).toHaveBeenCalledTimes(1);
        });

        it('should safely ignore unknown GLOBAL_ACTION sub-actions', () => {
            simulateIpcMessage({ type: 'GLOBAL_ACTION', timestampMs: 0, action: 'SELF_DESTRUCT' as any });
            receiver.tick(1, 16);
            expect(mockEnginePort.stopAll).not.toHaveBeenCalled();
            expect(mockEnginePort.pauseAll).not.toHaveBeenCalled();
            expect(mockEnginePort.resumeAll).not.toHaveBeenCalled();
        });

        it('should handle CLEAR_ALL_OVERRIDES', () => {
            simulateIpcMessage({ type: 'CLEAR_ALL_OVERRIDES', timestampMs: 0 });
            receiver.tick(1, 16);
            expect(mockEnginePort.clearAllOverrides).toHaveBeenCalledTimes(1);
        });

        it('should safely ignore unknown command types (fallthrough without crashing)', () => {
            simulateIpcMessage({ type: 'UNKNOWN_COMMAND_XYZ', timestampMs: 0 } as any);
            expect(() => {
                receiver.tick(1, 16);
            }).not.toThrow();
        });
    });

    describe('Error Handling', () => {
        it('should catch exceptions thrown by port methods and log them to console.error', () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const testError = new Error('Engine crash');

            mockEnginePort.fireEvent.mockImplementation(() => {
                throw testError;
            });

            simulateIpcMessage({ type: 'FIRE_EVENT', timestampMs: 0, eventId: 'broken_event' as EventId });
            expect(() => {
                receiver.tick(1, 16);
            }).not.toThrow();
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[CommandReceiver] Failed to execute command FIRE_EVENT',
                testError
            );

            consoleErrorSpy.mockRestore();
        });

        it('should continue processing remaining commands in the batch even if one fails', () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            mockEnginePort.fireEvent.mockImplementation(() => {
                throw new Error('Boom');
            });

            simulateIpcMessage({ type: 'FIRE_EVENT', timestampMs: 0, eventId: 'broken_event' as EventId });
            simulateIpcMessage({ type: 'CLEAR_ALL_OVERRIDES', timestampMs: 0 });

            receiver.tick(1, 16);
            expect(mockEnginePort.clearAllOverrides).toHaveBeenCalledTimes(1);

            consoleErrorSpy.mockRestore();
        });
    });
});
