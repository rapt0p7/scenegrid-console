import type { AnySoundConfig, IContainerSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';

import { SoundId } from '@scene-grid/shared';
import { describe, expect, it, vi } from 'vitest';

import ContainerSoundRule from '../ContainerSoundRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('ContainerSoundRule', () => {
    describe('validate', () => {
        it('should ignore non-container sound configurations', () => {
            const rule = new ContainerSoundRule();
            const assertRequiredTypeSpy = vi.fn();
            const validateTupleSpy = vi.fn();

            const context = createStubContext({});
            context.assertRequiredType = assertRequiredTypeSpy;
            context.validateTuple = validateTupleSpy;

            const nonContainerSound: AnySoundConfig = {
                src: 'audio/bgm.ogg'
            };

            rule.validate('bgm_main', nonContainerSound, context);

            expect(assertRequiredTypeSpy).not.toHaveBeenCalled();
            expect(validateTupleSpy).not.toHaveBeenCalled();
        });

        it('should assert required string type with exact path for container mode (Line 12)', () => {
            const rule = new ContainerSoundRule();
            const assertRequiredTypeSpy = vi.fn().mockReturnValue(true);

            const context = createStubContext({});
            context.assertRequiredType = assertRequiredTypeSpy;

            const containerConfig: IContainerSoundConfig = {
                isContainer: true,
                mode: 'random',
                sources: ['sfx_step_wood' as SoundId]
            };

            rule.validate('player_footsteps', containerConfig, context);

            expect(assertRequiredTypeSpy).toHaveBeenCalledWith('soundMap.player_footsteps.mode', 'random', 'string');
        });

        it('should validate volumeRange and pitchRange with exact schema paths when defined (Lines 16 & 17)', () => {
            const rule = new ContainerSoundRule();
            const validateTupleSpy = vi.fn();

            const context = createStubContext({});
            context.validateTuple = validateTupleSpy;

            const containerConfig: IContainerSoundConfig = {
                isContainer: true,
                mode: 'sequence',
                sources: ['sfx_click_1' as SoundId, 'sfx_click_2' as SoundId],
                volumeRange: [0.8, 1.2],
                pitchRange: [0.9, 1.1]
            };

            rule.validate('ui_clicks', containerConfig, context);

            expect(validateTupleSpy).toHaveBeenCalledTimes(2);
            expect(validateTupleSpy).toHaveBeenNthCalledWith(1, 'soundMap.ui_clicks.volumeRange', [0.8, 1.2]);
            expect(validateTupleSpy).toHaveBeenNthCalledWith(2, 'soundMap.ui_clicks.pitchRange', [0.9, 1.1]);
        });

        it('should not call validateTuple when volumeRange and pitchRange are omitted', () => {
            const rule = new ContainerSoundRule();
            const validateTupleSpy = vi.fn();

            const context = createStubContext({});
            context.validateTuple = validateTupleSpy;

            const containerConfig: IContainerSoundConfig = {
                isContainer: true,
                mode: 'random',
                sources: ['sfx_coin' as SoundId]
            };

            rule.validate('coin_pickup', containerConfig, context);

            expect(validateTupleSpy).not.toHaveBeenCalled();
        });
    });
});
