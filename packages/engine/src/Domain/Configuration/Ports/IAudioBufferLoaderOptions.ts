/**
 * Configuration options for audio buffer loading security and networking policies.
 */
export interface IAudioBufferLoaderOptions {
    /**
     * Optional allowlist of permitted external domains/subdomains (e.g. ['cdn.example.com']).
     */
    readonly allowedDomains?: readonly string[];

    /**
     * Allows requests to localhost / 127.0.0.1 (e.g. for local dev servers or automated tests).
     * Defaults to false for SSRF defense.
     */
    readonly allowLoopback?: boolean;

    /**
     * Optional custom validation predicate. Return false to block the request.
     */
    readonly customValidator?: (url: string) => boolean;
}
