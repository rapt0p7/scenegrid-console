import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as workerTimers from 'worker-timers';

import { LoopState } from '../../interfaces/ISmartLoopManager';
import AudioGrid from '../AudioGrid';
import SmartLoopManager from '../SmartLoopManager';

vi.mock('worker-timers', () => ({
    setInterval: vi.fn(),
    clearInterval: vi.fn()
}));

vi.mock('../AudioGrid', () => {
    const MockGrid = vi.fn();
    MockGrid.prototype.getNextBeatTime = vi.fn().mockReturnValue(1.5);
    MockGrid.prototype.getNextBarTime = vi.fn().mockReturnValue(2);
    return { default: MockGrid };
});

describe('SmartLoopManager (Interactive Music)', () => {
    let mockContext: any;
    let mockController: any;
    let mockRouter: any;
    let mockAutomation: any;
    let mockInstance: any;
    let manager: SmartLoopManager;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContext = { currentTime: 0, sampleRate: 44_100 };

        mockInstance = {
            cancelScheduled: vi.fn(),
            stop: vi.fn(),
            on: vi.fn().mockReturnValue(vi.fn()),
            instanceGain: { gain: {} },
            outputNode: { context: mockContext }
        };

        mockController = {
            play: vi.fn().mockReturnValue({ playbackId: 1, instance: mockInstance })
        };

        mockRouter = {
            getSoundConfig: vi.fn().mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    beatsPerBar: 4,
                    crossfade: 500,
                    regions: {
                        intro: [0, 44_100],
                        main: [44_100, 132_300],
                        fill: [132_300, 176_400]
                    }
                }
            }),
            routeSound: vi.fn(),
            applyConfigToInstance: vi.fn()
        };

        mockAutomation = { ramp: vi.fn(), set: vi.fn() };

        manager = new SmartLoopManager(mockController, mockRouter, mockAutomation);
    });

    afterEach(() => {
        manager.destroy();
    });

    // eslint-disable-next-line unicorn/consistent-function-scoping
    function triggerTick() {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        const tickCallback = vi.mocked(workerTimers.setInterval).mock.calls[0][0] as Function;
        tickCallback();
    }

    it('should start timer on init and clear on destroy', () => {
        expect(workerTimers.setInterval).toHaveBeenCalledTimes(1);
        manager.destroy();
        expect(workerTimers.clearInterval).toHaveBeenCalledTimes(1);
    });

    it('should schedule the initial loop region correctly', () => {
        manager.playLoop('battle_music', 'intro');

        expect(mockController.play).toHaveBeenCalledWith('battle_music', {
            when: 0,
            offset: 0,
            duration: 1
        });
        const expectedConfig = mockRouter.getSoundConfig('battle_music');
        expect(mockRouter.applyConfigToInstance).toHaveBeenCalledWith(mockInstance, expectedConfig);
    });

    it('should pre-schedule the next iteration via Lookahead Window', () => {
        manager.playLoop('battle_music', 'intro');
        mockController.play.mockClear();

        mockContext.currentTime = 0.95;
        triggerTick();

        expect(mockController.play).toHaveBeenCalledTimes(1);
        const arguments_ = mockController.play.mock.calls[0];

        expect(arguments_[0]).toBe('battle_music');
        expect(arguments_[1].when).toBeCloseTo(0.05, 5);
        expect(arguments_[1].offset).toBe(0);
        expect(arguments_[1].duration).toBe(1);
    });

    it('should stop loop and cancel scheduled regions', () => {
        manager.playLoop('battle_music', 'intro');
        manager.stopLoop('battle_music');
        expect(mockInstance.cancelScheduled).toHaveBeenCalledTimes(1);
    });

    it('should perform IMMEDIATE transition with crossfade', () => {
        manager.playLoop('battle_music', 'intro');
        mockContext.currentTime = 0.5;

        manager.transitionTo({
            soundId: 'battle_music',
            targetRegion: 'main',
            transitionRegionName: '',
            options: { quantize: 'Immediate', crossfadeDuration: 1000 }
        });

        expect(mockAutomation.ramp).toHaveBeenCalledWith(mockInstance.instanceGain.gain, 0, 1000, 'equal-power', 0);
        expect(mockInstance.stop).toHaveBeenCalledWith(1.5);
        expect(mockController.play).toHaveBeenCalledWith('battle_music', {
            when: 0,
            offset: 1,
            duration: 2
        });
    });

    it('should perform QUANTIZED transition using AudioGrid', () => {
        manager.playLoop('battle_music', 'intro');

        mockController.play.mockClear();

        mockContext.currentTime = 0.8;

        manager.transitionTo({
            soundId: 'battle_music',
            targetRegion: 'main',
            transitionRegionName: '',
            options: { quantize: 'NextBar' }
        });

        expect(mockController.play).not.toHaveBeenCalled();

        mockContext.currentTime = 1.95;
        triggerTick();

        expect(mockController.play).toHaveBeenCalledTimes(1);

        const arguments_ = mockController.play.mock.calls[0];
        expect(arguments_[1].when).toBeCloseTo(0.05, 5);
        expect(arguments_[1].offset).toBe(1);
        expect(arguments_[1].duration).toBe(2);
    });

    it('should queue a Transition Region (Fill) before the Target Region', () => {
        manager.playLoop('battle_music', 'intro');
        mockController.play.mockClear();

        manager.transitionTo({
            soundId: 'battle_music',
            targetRegion: 'main',
            transitionRegionName: 'fill',
            options: { quantize: 'Immediate' }
        });

        expect(mockController.play).toHaveBeenCalledWith('battle_music', {
            when: 0,
            offset: 3,
            duration: 1
        });

        mockController.play.mockClear();
        mockContext.currentTime = 0.95;
        triggerTick();

        expect(mockController.play).toHaveBeenCalledTimes(1);
        const arguments_ = mockController.play.mock.calls[0];

        expect(arguments_[0]).toBe('battle_music');
        expect(arguments_[1].when).toBeCloseTo(0.05, 5);
        expect(arguments_[1].offset).toBe(1); // 'main'
        expect(arguments_[1].duration).toBe(2);
    });

    it('should use provided AudioGrid instance if passed in options', () => {
        manager.playLoop('battle_music', 'intro');
        const customGrid = new AudioGrid(120, 4);
        const beatSpy = vi.spyOn(customGrid, 'getNextBeatTime').mockReturnValue(5);

        manager.transitionTo({
            soundId: 'battle_music',
            targetRegion: 'main',
            transitionRegionName: '',
            options: { quantize: 'NextBeat', grid: customGrid }
        });

        expect(beatSpy).toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(manager.tracks.get('battle_music').nextScheduleTime).toBe(5);
    });

    it('should stop instance immediately without ramp if crossfadeDuration is 0', () => {
        manager.playLoop('battle_music', 'intro');

        const track = (manager as any).tracks.get('battle_music');

        const activeRegion = {
            instance: mockInstance,
            scheduledStartTime: -1,
            unsubscribe: vi.fn()
        };

        track.activeRegions.add(activeRegion);
        track.state = LoopState.LOOPING;

        manager.transitionTo({
            soundId: 'battle_music',
            targetRegion: 'main',
            transitionRegionName: '',
            options: {
                quantize: 'Immediate',
                crossfadeDuration: 0
            }
        });

        expect(mockAutomation.ramp).not.toHaveBeenCalled();
        expect(mockInstance.stop).toHaveBeenCalledWith(0);
    });

    it('should handle missing regions gracefully (return null)', () => {
        manager.playLoop('battle_music', 'non_existent_region');
        expect(mockController.play).not.toHaveBeenCalled();
    });

    it('should use targetTime as delay if referenceContext is not yet established', () => {
        mockInstance.outputNode = null;

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        manager.scheduleRegion({
            soundId: 'battle_music',
            regionName: 'intro',
            targetTime: 2,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            track: manager.getTrackContext('battle_music')
        });

        expect(mockController.play).toHaveBeenCalledWith(
            'battle_music',
            expect.objectContaining({
                when: 2
            })
        );
    });

    it('should handle voice drop (controller.play returns null) and move schedule pointer forward', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockController.play.mockReturnValueOnce(null);

        manager.playLoop('battle_music', 'intro');

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to schedule region'));

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        expect(manager.tracks.get('battle_music').nextScheduleTime).toBe(1);
        warnSpy.mockRestore();
    });

    it('should cleanup active regions and unsubscribe on "ended" event', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type,unicorn/consistent-function-scoping
        let endedCallback: Function = () => {};
        const unsubscribeSpy = vi.fn();

        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        mockInstance.on.mockImplementation((event: string, callback: Function) => {
            if (event === 'ended') endedCallback = callback;
            return unsubscribeSpy;
        });

        manager.playLoop('battle_music', 'intro');

        const track = (manager as any).tracks.get('battle_music');
        expect(track.activeRegions.size).toBe(1);

        endedCallback();

        expect(track.activeRegions.size).toBe(0);
        expect(unsubscribeSpy).toHaveBeenCalled();
    });
});
