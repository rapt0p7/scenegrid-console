## Purpose
Provides a fallback-aware loading mechanism for AudioWorkletProcessor scripts to ensure they successfully load in strict CSP environments and iframes where `blob:` URLs may be blocked.

## ADDED Requirements

### Requirement: Fallback worklet loading
The infrastructure layer SHALL provide a unified loader that progressively attempts to initialize an `AudioWorkletNode` using available methods, gracefully falling back when strict security policies block the preferred method.

#### Scenario: Blob URL succeeds
- **GIVEN** a raw JavaScript string containing an AudioWorkletProcessor
- **WHEN** the environment permits `blob:` URLs in its security policy
- **THEN** the loader successfully initializes the worklet using `URL.createObjectURL(blob)`

#### Scenario: Blob URL blocked, Data URI succeeds
- **GIVEN** a raw JavaScript string containing an AudioWorkletProcessor
- **WHEN** the environment blocks `blob:` URLs but permits `data:` URIs
- **THEN** the loader catches the initialization failure and successfully initializes the worklet using a Base64 encoded `data:application/javascript` URI.
