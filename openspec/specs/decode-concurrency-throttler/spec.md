# Capability: decode-concurrency-throttler

## Purpose
TBD - Add a concurrency throttler to limit concurrent network fetches and decode operations to prevent memory spikes.

## Requirements

### Requirement: Decode Concurrency Throttling
The system SHALL limit the number of concurrent network fetch and `decodeAudioData` operations during audio batch loading to prevent memory spikes and main thread freezing.

#### Scenario: Enqueueing tasks under the limit
- **WHEN** the number of active load tasks is below the configured concurrency limit
- **THEN** new tasks SHALL execute immediately

#### Scenario: Enqueueing tasks exceeding the limit
- **WHEN** the number of active load tasks reaches the configured concurrency limit
- **THEN** new tasks SHALL be queued in a zero-allocation circular buffer until an active task completes

#### Scenario: Task completion triggers next task
- **WHEN** an active task completes and there are pending tasks in the queue
- **THEN** the next task from the queue SHALL be executed immediately

#### Scenario: Configuring the limit
- **WHEN** the `AudioEngine` is initialized with a specific `decodeConcurrencyLimit`
- **THEN** the `AudioBufferLoader` SHALL use this limit for concurrent operations
