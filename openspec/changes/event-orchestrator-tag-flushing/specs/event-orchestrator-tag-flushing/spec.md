## Purpose

Provides a mechanism to assign logical tags to event actions and flush future or active audio operations by those tags without disrupting untagged operations.

## ADDED Requirements

### Requirement: Event Actions can be tagged
The system SHALL allow any event action configuration to specify an optional array of string tags.

#### Scenario: Tagging an action
- **GIVEN** an event configuration with a play action
- **WHEN** the user adds a `tags: ["cutscene"]` property to the action
- **THEN** the `AudioEventOrchestrator` associates the resulting spawned audio operations with the "cutscene" tag.

### Requirement: System can cancel pending and active operations by tag
The system SHALL provide a `cancel_pending` action type that targets specific tags, which immediately flushes matching scheduled actions, active playbacks, and active loops.

#### Scenario: Canceling by tag
- **GIVEN** a scheduled action, an active playback, and an active loop all associated with the "cutscene" tag
- **WHEN** a `cancel_pending` action with `targetTags: ["cutscene"]` is executed
- **THEN** the scheduled action is removed from the queue
- **THEN** the active playback is stopped via the router
- **THEN** the active loop is stopped via the sequencer

### Requirement: Garbage collection is zero-allocation
The system SHALL automatically clean up tracked playbacks when they finish naturally, and this cleanup process MUST NOT allocate memory in the hot path.

#### Scenario: Natural playback completion
- **GIVEN** a tagged playback that has finished playing
- **WHEN** the `AudioEventOrchestrator` ticks
- **THEN** the system detects the stopped state using `SoundController` and removes the playback from tracking using a zero-allocation swap-and-pop array operation.
