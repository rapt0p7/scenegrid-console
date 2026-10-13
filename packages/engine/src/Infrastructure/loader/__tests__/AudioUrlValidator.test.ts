import { describe, expect, it } from 'vitest';

import { isAudioUrlSafe, validateAudioUrl } from '../AudioUrlValidator.js';

describe('AudioUrlValidator', () => {
    describe('validateAudioUrl', () => {
        it('rejects empty or whitespace URLs', () => {
            expect(validateAudioUrl('').ok).toBe(false);
            expect(validateAudioUrl('   ').ok).toBe(false);
            // @ts-expect-error test invalid types
            expect(validateAudioUrl(null).ok).toBe(false);
            // @ts-expect-error test invalid types
            expect(validateAudioUrl(undefined).ok).toBe(false);
        });

        it('permits in-memory blob URLs', () => {
            const result = validateAudioUrl('blob:https://example.com/1234-5678');
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe('blob:https://example.com/1234-5678');
            }
        });

        it('permits audio and octet-stream data URLs', () => {
            expect(
                validateAudioUrl('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=')
                    .ok
            ).toBe(true);
            expect(validateAudioUrl('data:audio/mpeg;base64,SUQzBAAAAAAA').ok).toBe(true);
            expect(validateAudioUrl('data:application/octet-stream;base64,AAAA').ok).toBe(true);
        });

        it('rejects non-audio data URLs', () => {
            const htmlResult = validateAudioUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==');
            expect(htmlResult.ok).toBe(false);

            const imageResult = validateAudioUrl(
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
            );
            expect(imageResult.ok).toBe(false);
        });

        it('permits relative asset paths', () => {
            expect(validateAudioUrl('sound.mp3').ok).toBe(true);
            expect(validateAudioUrl('/assets/audio/fx.wav').ok).toBe(true);
            expect(validateAudioUrl('../music/theme.ogg').ok).toBe(true);
            expect(validateAudioUrl('valid.mp3').ok).toBe(true);
            expect(validateAudioUrl('A').ok).toBe(true);
        });

        it('rejects dangerous URL protocols', () => {
            expect(validateAudioUrl('file:///etc/passwd').ok).toBe(false);
            expect(validateAudioUrl('gopher://127.0.0.1:70/').ok).toBe(false);
            expect(validateAudioUrl('ftp://example.com/audio.wav').ok).toBe(false);
            expect(validateAudioUrl('javascript:alert(1)').ok).toBe(false);
        });

        it('blocks loopback and cloud metadata by default', () => {
            expect(validateAudioUrl('http://localhost/sound.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://127.0.0.1/sound.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://subdomain.localhost/sound.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://[::1]/sound.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://0.0.0.0/sound.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://169.254.169.254/latest/meta-data/').ok).toBe(false);
            expect(validateAudioUrl('http://metadata.google.internal/computeMetadata/v1/').ok).toBe(false);
            expect(validateAudioUrl('http://instance-data/latest/').ok).toBe(false);
        });

        it('blocks IPv6 link-local and unique-local private addresses', () => {
            expect(validateAudioUrl('http://[fe80::1]/sound.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://[fc00::1]/sound.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://[fd12:3456:789a::1]/sound.mp3').ok).toBe(false);
        });

        it('rejects malformed URLs that fail URL parsing', () => {
            expect(validateAudioUrl('http://[').ok).toBe(false);
            expect(validateAudioUrl('https://[invalid-ipv6]/sound.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://:80/sound.mp3').ok).toBe(false);
        });

        it('blocks RFC 1918 and CGNAT private IP ranges', () => {
            expect(validateAudioUrl('http://10.0.0.1/audio.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://10.255.255.255/audio.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://172.16.0.1/audio.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://172.31.255.255/audio.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://192.168.0.1/audio.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://192.168.100.50/audio.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://100.64.0.1/audio.mp3').ok).toBe(false);
            expect(validateAudioUrl('http://100.127.255.255/audio.mp3').ok).toBe(false);
        });

        it('handles domain names with numeric segments gracefully', () => {
            expect(validateAudioUrl('https://1.2.3.com/audio.mp3').ok).toBe(true);
            expect(validateAudioUrl('https://server1.zone2.org/audio.mp3').ok).toBe(true);
        });

        it('allows legitimate public HTTPS audio URLs', () => {
            const result = validateAudioUrl('https://cdn.example.com/audio/track.mp3');
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe('https://cdn.example.com/audio/track.mp3');
            }
        });

        it('allows loopback when allowLoopback is explicitly configured', () => {
            const options = { allowLoopback: true };
            expect(validateAudioUrl('http://localhost:3000/sound.mp3', options).ok).toBe(true);
            expect(validateAudioUrl('http://127.0.0.1:8080/sound.mp3', options).ok).toBe(true);
            expect(validateAudioUrl('http://[::1]:8080/sound.mp3', options).ok).toBe(true);
            // allowLoopback does NOT permit private networks or metadata endpoints
            expect(validateAudioUrl('http://10.0.0.1/sound.mp3', options).ok).toBe(false);
            expect(validateAudioUrl('http://169.254.169.254/sound.mp3', options).ok).toBe(false);
        });

        it('enforces allowedDomains when configured', () => {
            const options = { allowedDomains: ['cdn.example.com', 'assets.game.io'] };

            expect(validateAudioUrl('https://cdn.example.com/audio.mp3', options).ok).toBe(true);
            expect(validateAudioUrl('https://sub.cdn.example.com/audio.mp3', options).ok).toBe(true);
            expect(validateAudioUrl('https://assets.game.io/audio.mp3', options).ok).toBe(true);
            expect(validateAudioUrl('https://untrusted-host.com/audio.mp3', options).ok).toBe(false);

            // Empty array allows normal public URLs
            expect(validateAudioUrl('https://anydomain.org/audio.mp3', { allowedDomains: [] }).ok).toBe(true);
        });

        it('respects customValidator callback', () => {
            const options = {
                customValidator: (url: string) => !url.includes('forbidden')
            };

            expect(validateAudioUrl('https://cdn.example.com/allowed.mp3', options).ok).toBe(true);
            expect(validateAudioUrl('https://cdn.example.com/forbidden.mp3', options).ok).toBe(false);
        });
    });

    describe('isAudioUrlSafe', () => {
        it('returns true for safe URLs and false for blocked URLs', () => {
            expect(isAudioUrlSafe('https://cdn.example.com/sound.mp3')).toBe(true);
            expect(isAudioUrlSafe('sound.wav')).toBe(true);
            expect(isAudioUrlSafe('http://169.254.169.254/latest/meta-data/')).toBe(false);
            expect(isAudioUrlSafe('http://localhost:8000/')).toBe(false);
        });
    });
});
