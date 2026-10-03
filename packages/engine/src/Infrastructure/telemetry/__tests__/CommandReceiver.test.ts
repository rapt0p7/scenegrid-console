import type { IInspectorDebugPort } from '@domain/Shared/Ports/IInspectorDebugPort.js';
import type { InspectorCommand } from '@scene-grid/shared';

// noinspection D
import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';

import { CommandReceiver } from '../CommandReceiver.js';

describe('CommandReceiver', () => {
    let mockPort: MessagePort;
    let mockEnginePort: Mocked<IInspectorDebugPort>;
    let simulateIpcMessage: (event: MessageEvent) => void;
    let receiver: CommandReceiver;

    // oxlint-disable-next-line typescript/no-redundant-type-constituents
    const simulateCmd = (cmd: Partial<InspectorCommand> | unknown) => {
        simulateIpcMessage({ data: cmd } as MessageEvent);
    };

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

        mockPort = {
            addEventListener: vi.fn((event, cb) => {
                if (event === 'message') {
                    simulateIpcMessage = cb;
                }
            }),
            removeEventListener: vi.fn(),
            start: vi.fn()
        } as unknown as MessagePort;

        receiver = new CommandReceiver(mockPort, mockEnginePort);
    });

    describe('Initialization & Lifecycle', () => {
        it('should subscribe to the MessagePort on instantiation and call start()', () => {
            expect(mockPort.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
            expect(mockPort.start).toHaveBeenCalledTimes(1);
        });

        it('should remove the event listener when dispose() is called', () => {
            receiver.dispose();
            expect(mockPort.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
        });
    });

    describe('Message Validation & Queue Processing', () => {
        it('should safely ignore empty, non-object, or typeless messages', () => {
            simulateCmd(null);
            simulateCmd('just a string');
            simulateCmd({ notACommand: true });

            receiver.tick(1, 16);
            expect(mockEnginePort.fireEvent).not.toHaveBeenCalled();
            expect(mockEnginePort.stopAll).not.toHaveBeenCalled();
        });

        it('should return early and do nothing if the queue is empty', () => {
            receiver.tick(1, 16);
            expect(mockEnginePort.fireEvent).not.toHaveBeenCalled();
        });

        it('should process a batch of valid commands in order and clear the queue', () => {
            simulateCmd({ type: 'GLOBAL_ACTION', action: 'STOP_ALL' });
            simulateCmd({ type: 'FIRE_EVENT', eventId: 'event_1' });
            simulateCmd({ type: 'CLEAR_ALL_OVERRIDES' });

            receiver.tick(1, 16);

            expect(mockEnginePort.stopAll).toHaveBeenCalledTimes(1);
            expect(mockEnginePort.fireEvent).toHaveBeenCalledWith('event_1');
            expect(mockEnginePort.clearAllOverrides).toHaveBeenCalledTimes(1);

            mockEnginePort.fireEvent.mockClear();
            receiver.tick(2, 16);
            expect(mockEnginePort.fireEvent).not.toHaveBeenCalled();
        });
    });

    describe('Command Routing (processCommand)', () => {
        it('should handle FIRE_EVENT', () => {
            simulateCmd({ type: 'FIRE_EVENT', eventId: 'boom' });
            receiver.tick(1, 16);
            expect(mockEnginePort.fireEvent).toHaveBeenCalledWith('boom');
        });

        it('should handle APPLY_SNAPSHOT with and without fadeTime', () => {
            simulateCmd({ type: 'APPLY_SNAPSHOT', snapshotId: 'snap1' });
            receiver.tick(1, 16);
            expect(mockEnginePort.applySnapshot).toHaveBeenCalledWith('snap1', undefined);

            simulateCmd({ type: 'APPLY_SNAPSHOT', snapshotId: 'snap2', fadeTime: 500 });
            receiver.tick(2, 16);
            expect(mockEnginePort.applySnapshot).toHaveBeenCalledWith('snap2', 500);
        });

        it('should handle SET_RTPC', () => {
            simulateCmd({ type: 'SET_RTPC', param: 'health', value: 50, isOverride: true });
            receiver.tick(1, 16);
            expect(mockEnginePort.setRtpcOverride).toHaveBeenCalledWith('health', 50, true);
        });

        it('should handle SET_SWITCH', () => {
            simulateCmd({ type: 'SET_SWITCH', switchId: 'surface', currentKey: 'metal', isOverride: false });
            receiver.tick(1, 16);
            expect(mockEnginePort.setSwitchOverride).toHaveBeenCalledWith('surface', 'metal', false);
        });

        it('should handle PLAY_LOOP', () => {
            simulateCmd({ type: 'PLAY_LOOP', soundId: 'bgm_track', regionName: 'intro' });
            receiver.tick(1, 16);
            expect(mockEnginePort.playLoop).toHaveBeenCalledWith('bgm_track', 'intro');
        });

        it('should handle STOP_LOOP', () => {
            simulateCmd({ type: 'STOP_LOOP', soundId: 'bgm_track' });
            receiver.tick(1, 16);
            expect(mockEnginePort.stopLoop).toHaveBeenCalledWith('bgm_track');
        });

        it('should handle TRANSITION_MUSIC with optional parameters', () => {
            const mockOptions = { quantize: 'NextBar' } as const;
            simulateCmd({
                type: 'TRANSITION_MUSIC',
                soundId: 'bgm_track',
                targetRegion: 'chorus',
                transitionRegionName: 'fill',
                options: mockOptions
            });
            receiver.tick(1, 16);
            expect(mockEnginePort.transitionMusicTo).toHaveBeenCalledWith('bgm_track', 'chorus', 'fill', mockOptions);
        });

        it('should handle GLOBAL_ACTION sub-commands', () => {
            simulateCmd({ type: 'GLOBAL_ACTION', action: 'STOP_ALL' });
            simulateCmd({ type: 'GLOBAL_ACTION', action: 'PAUSE_ALL' });
            simulateCmd({ type: 'GLOBAL_ACTION', action: 'RESUME_ALL' });

            receiver.tick(1, 16);

            expect(mockEnginePort.stopAll).toHaveBeenCalledTimes(1);
            expect(mockEnginePort.pauseAll).toHaveBeenCalledTimes(1);
            expect(mockEnginePort.resumeAll).toHaveBeenCalledTimes(1);
        });

        it('should safely ignore unknown GLOBAL_ACTION sub-actions', () => {
            simulateCmd({ type: 'GLOBAL_ACTION', action: 'SELF_DESTRUCT' });
            receiver.tick(1, 16);
            expect(mockEnginePort.stopAll).not.toHaveBeenCalled();
            expect(mockEnginePort.pauseAll).not.toHaveBeenCalled();
        });

        it('should handle CLEAR_ALL_OVERRIDES', () => {
            simulateCmd({ type: 'CLEAR_ALL_OVERRIDES' });
            receiver.tick(1, 16);
            expect(mockEnginePort.clearAllOverrides).toHaveBeenCalledTimes(1);
        });

        it('should safely ignore unknown command types (fallthrough without crashing)', () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            simulateCmd({ type: 'UNKNOWN_COMMAND_XYZ' });
            expect(() => {
                receiver.tick(1, 16);
            }).not.toThrow();

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                '[CommandReceiver] Unhandled command type: UNKNOWN_COMMAND_XYZ'
            );

            consoleWarnSpy.mockRestore();
        });
    });

    describe('Error Handling', () => {
        it('should catch exceptions thrown by port methods and log them to console.error', () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const testError = new Error('Engine crash');

            mockEnginePort.fireEvent.mockImplementation(() => {
                throw testError;
            });

            simulateCmd({ type: 'FIRE_EVENT', eventId: 'broken_event' });

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
            vi.spyOn(console, 'error').mockImplementation(() => {});

            mockEnginePort.fireEvent.mockImplementation(() => {
                throw new Error('Boom');
            });

            simulateCmd({ type: 'FIRE_EVENT', eventId: 'broken_event' });
            simulateCmd({ type: 'CLEAR_ALL_OVERRIDES' });

            receiver.tick(1, 16);
            expect(mockEnginePort.clearAllOverrides).toHaveBeenCalledTimes(1);

            vi.restoreAllMocks();
        });
    });
});
