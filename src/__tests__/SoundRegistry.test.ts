import { describe, it, expect } from 'vitest';

import SoundRegistry from '../SoundRegistry.js';

describe('SoundRegistry', () => {
    it('should register and retrieve a sound descriptor', () => {
        const registry = new SoundRegistry();
        const mockDescriptor = { buffer: {} as AudioBuffer, options: { url: 'test.mp3' } };

        registry.register('test_sound', mockDescriptor);

        expect(registry.get('test_sound')).toBe(mockDescriptor);
    });

    it('should throw an error if retrieving an unregistered sound', () => {
        const registry = new SoundRegistry();

        expect(() => registry.get('unknown')).toThrow('Sound "unknown" not registered');
    });

    it('should expose the internal map via the registry getter', () => {
        const registry = new SoundRegistry();
        const mockDescriptor = { buffer: {} as AudioBuffer, options: { url: 'test.mp3' } };

        registry.register('test_sound', mockDescriptor);
        const map = registry.registry;

        expect(map).toBeInstanceOf(Map);
        expect(map.get('test_sound')).toBe(mockDescriptor);
    });
});
