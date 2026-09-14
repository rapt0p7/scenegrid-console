import { describe, it, expect } from 'vitest';

import { routeAsset } from '../router.js';

describe('Routing Logic', () => {
    it('routes assets > 15MB to chunking', () => {
        expect(routeAsset(16.0, 15.0, 'test', [], [])).toBe('chunk');
    });

    it('routes assets <= 15MB to ladder', () => {
        expect(routeAsset(15.0, 15.0, 'test', [], [])).toBe('ladder');
        expect(routeAsset(14.9, 15.0, 'test', [], [])).toBe('ladder');
    });

    it('forces chunking for matching streamRules', () => {
        expect(routeAsset(1.0, 15.0, 'bgm_theme', ['bgm_.*'], [])).toBe('chunk');
    });

    it('forces ladder for matching streamExclusions', () => {
        expect(routeAsset(20.0, 15.0, 'sfx_explosion', [], ['sfx_.*'])).toBe('ladder');
    });
});
