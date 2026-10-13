// oxlint-disable unicorn/no-useless-undefined
import type { IAudioBufferLoaderOptions } from '@domain/Configuration/Ports/IAudioBufferLoaderOptions.js';

import { Err, Ok, type Result } from '@scene-grid/shared';

interface ISubnet {
    readonly network: number;
    readonly mask: number;
}

const DUMMY_BASE = 'https://scenegrid.safe';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const ALLOWED_DATA_PREFIXES = ['data:audio/', 'data:application/octet-stream'];

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'instance-data', '::1', '::', '0.0.0.0']);

const BLOCKED_IPV6_PREFIXES = ['fe80:', 'fc', 'fd'];

/**
 * CIDR subnet bitmasks for IPv4 private, link-local, and loopback ranges.
 * - 0.0.0.0/8: "This" network
 * - 10.0.0.0/8: RFC 1918 Private
 * - 100.64.0.0/10: RFC 6598 Carrier-Grade NAT
 * - 127.0.0.0/8: RFC 1122 Loopback
 * - 169.254.0.0/16: RFC 3927 Link-Local / AWS/GCP/Azure Metadata
 * - 172.16.0.0/12: RFC 1918 Private
 * - 192.168.0.0/16: RFC 1918 Private
 */
const PRIVATE_IPV4_SUBNETS: readonly ISubnet[] = [
    { network: 0x00000000, mask: 0xff000000 },
    { network: 0x0a000000, mask: 0xff000000 },
    { network: 0x64400000, mask: 0xffc00000 },
    { network: 0x7f000000, mask: 0xff000000 },
    { network: 0xa9fe0000, mask: 0xffff0000 },
    { network: 0xac100000, mask: 0xfff00000 },
    { network: 0xc0a80000, mask: 0xffff0000 }
];

function parseIpv4(host: string): number | null {
    const parts = host.split('.');
    if (parts.length !== 4) return null;

    let num = 0;
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null;
        num = num * 256 + Number(part);
    }
    return num;
}

function isPrivateIpv4(ipNum: number): boolean {
    return PRIVATE_IPV4_SUBNETS.some(sub => (ipNum & sub.mask) >>> 0 === sub.network);
}

function normalizeHostname(rawHostname: string): string {
    const isEnclosedIpv6 = rawHostname.startsWith('[') && rawHostname.endsWith(']');
    const host = isEnclosedIpv6 ? rawHostname.slice(1, -1) : rawHostname;
    return host.toLowerCase();
}

function isLoopbackHost(host: string): boolean {
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isBlockedHost(host: string): boolean {
    if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
        return true;
    }
    if (BLOCKED_IPV6_PREFIXES.some(prefix => host.startsWith(prefix))) {
        return true;
    }
    const ip = parseIpv4(host);
    return ip !== null && isPrivateIpv4(ip);
}

function isDomainAllowed(host: string, allowedDomains: readonly string[]): boolean {
    return allowedDomains.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function isRelativeUrl(url: string): boolean {
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
    const isProtocolRelative = url.startsWith('//');
    return !hasScheme && !isProtocolRelative;
}

function checkDataUrl(url: string): Result<string, Error> {
    const isAudioType = ALLOWED_DATA_PREFIXES.some(prefix => url.startsWith(prefix));
    return isAudioType ? Ok(url) : Err(new Error('Data URLs must have an audio or binary MIME type.'));
}

function checkProtocol(protocol: string): Result<void, Error> {
    return ALLOWED_PROTOCOLS.has(protocol)
        ? Ok(undefined)
        : Err(new Error(`Unsupported protocol: "${protocol}". Only HTTP and HTTPS are permitted.`));
}

function checkHostSecurity(host: string, options?: IAudioBufferLoaderOptions): Result<void, Error> {
    if (options?.allowedDomains && options.allowedDomains.length > 0) {
        if (!isDomainAllowed(host, options.allowedDomains)) {
            return Err(new Error(`Host "${host}" is not in the allowed domains list.`));
        }
    }

    if (options?.allowLoopback && isLoopbackHost(host)) {
        return Ok(undefined);
    }

    if (isBlockedHost(host)) {
        return Err(new Error(`Blocked request to private or internal network resource: ${host}`));
    }

    return Ok(undefined);
}

function validateRemoteUrl(url: string, options?: IAudioBufferLoaderOptions): Result<string, Error> {
    let parsed: URL;
    try {
        parsed = new URL(url, DUMMY_BASE);
    } catch (error) {
        return Err(error as Error);
    }

    const protoCheck = checkProtocol(parsed.protocol);
    if (!protoCheck.ok) return protoCheck;

    const host = normalizeHostname(parsed.hostname);
    const hostCheck = checkHostSecurity(host, options);
    if (!hostCheck.ok) return hostCheck;

    if (options?.customValidator && !options.customValidator(url)) {
        return Err(new Error(`URL "${url}" failed custom security validation.`));
    }

    return Ok(parsed.href);
}

/**
 * Validates an audio resource URL to protect against Server-Side Request Forgery (SSRF, CWE-918).
 * Blocks internal network endpoints, loopback (unless opted-in), and unauthorized protocols.
 */
export function validateAudioUrl(url: string, options?: IAudioBufferLoaderOptions): Result<string, Error> {
    if (typeof url !== 'string' || url.trim() === '') {
        return Err(new Error('URL must be a non-empty string.'));
    }

    if (url.startsWith('blob:')) {
        return Ok(url);
    }

    if (url.startsWith('data:')) {
        return checkDataUrl(url);
    }

    if (isRelativeUrl(url)) {
        return Ok(url);
    }

    return validateRemoteUrl(url, options);
}

/**
 * Convenience boolean predicate to test whether a URL is considered safe for loading.
 */
export function isAudioUrlSafe(url: string, options?: IAudioBufferLoaderOptions): boolean {
    return validateAudioUrl(url, options).ok;
}
