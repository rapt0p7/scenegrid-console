## Purpose

Provides a CLI mechanism to export internal Domain TypeScript interfaces as standard JSON Schema for IDE integrations and AI agents.

## ADDED Requirements

### Requirement: Generate JSON Schemas
The CLI SHALL provide a `generate-schemas` command that parses the engine's internal Domain TypeScript interfaces and outputs them as a standard JSON Schema file.

#### Scenario: Running schema generation
- **WHEN** the user executes the `scenegrid generate-schemas` command
- **THEN** the CLI parses the Domain types and writes a `schema.json` file to the specified output directory

### Requirement: Branded Types Degradation
The CLI SHALL ensure that internal branded types (e.g., `BusId`, `SoundId`) are gracefully degraded to standard string definitions in the JSON Schema output to ensure compatibility with standard schema validators and LLMs.

#### Scenario: Branded type in schema
- **WHEN** the CLI encounters a branded string type like `BusId`
- **THEN** it outputs it as a standard `"type": "string"` in the resulting JSON schema
