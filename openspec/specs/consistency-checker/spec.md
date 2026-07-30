# Capability: consistency-checker

## Purpose
TBD - Validates audio configurations.

## Requirements

### Requirement: Consistency Checker Architecture
The system SHALL validate the integrity of audio configurations (routing, buses, snapshots, regions) using a composite plugin architecture to ensure high cohesion and maintainability, preserving the exact public validation API and behavior of the original monolithic `ConsistencyChecker`.

#### Scenario: Executing validation rules
- **WHEN** the `ConsistencyChecker` validates an audio configuration payload
- **THEN** it SHALL orchestrate a suite of isolated `IValidationRule` plugins (e.g., `RoutingCyclesRule`, `BusesRule`, `SnapshotsRule`) and aggregate their results into a centralized `ValidationContext`

#### Scenario: Delegating sound specific validations
- **WHEN** validating individual sound configurations within the sound map
- **THEN** the `SoundMapRule` SHALL delegate the logic to specific `ISoundValidationRule` implementations based on the sound type

#### Scenario: Preserving backwards compatibility
- **WHEN** the validation process completes
- **THEN** it SHALL produce identical error and warning strings as the legacy monolithic system to ensure all existing integration tests pass unmodified
