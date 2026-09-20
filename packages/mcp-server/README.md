# SceneGrid MCP Server

The SceneGrid MCP Server provides diagnostic and orchestration tools for the SceneGrid virtual digital mixing console and audio engine. It bridges the engine's internal telemetry worker with agents through standard MCP (Model Context Protocol) tool calls.

## Overview

This server acts as a WebSocket relay, connecting to a running instance of `scenegrid-console` configured with the `remoteSyncUri` targeting `ws://localhost:8081`. Once connected, the engine continuously streams its real-time telemetry (playbacks, buses, RTPC values, RAM limits) to the MCP server.

Agents and AI assistants can query this in-memory snapshot, trigger dynamic changes, or scaffold new structural configurations without requiring direct side-channel integrations with the web application.

## Available MCP Tools

### Runtime Debugging

These tools interact with the live state of the engine. Use them when you need to inspect what is currently playing, adjust parameters interactively, or resolve performance issues on the fly.

- **`get_active_playbacks`**
  - **Purpose**: Retrieves the currently active audio playbacks (voices) from the telemetry snapshot.
  - **Usage**: Call this to see which sounds are currently playing.
- **`get_bus_state`**
  - **Purpose**: Retrieves the current state of audio buses (volumes, ducking, effects).
  - **Usage**: Use this to check bus graph topology and live mixing values.
- **`get_rtpc_values`**
  - **Purpose**: Retrieves the live RTPC (Real-Time Parameter Control) values.
  - **Usage**: Use this to monitor game parameters and how they map to audio changes.
- **`get_engine_logs`**
  - **Purpose**: Retrieves the unified stream of recent engine events (both `LIFECYCLE` and `CAUSE_CHAIN`).
  - **Usage**: Call this when diagnosing routing cycles, missing connections, or unexpected ducking behaviors. It returns the sequence of events that led to the current state.
- **`get_ram_report`**
  - **Purpose**: Retrieves the live RAM report from the telemetry snapshot.
  - **Usage**: Use this to check memory usage and debug `RamQuotaRule` failures in real-time.
- **`get_consistency_report`**
  - **Purpose**: Retrieves the live validation and consistency report calculated by the engine worker.
  - **Usage**: Use this to read the real-time configuration consistency state, including any live errors or warnings the engine found during load.
- **`get_engine_manifest`**
  - **Purpose**: Retrieves the full static engine configuration (Manifest).
  - **Usage**: Call this to see the complete registered setup including banks, events, sound definitions, buses, and global limits.
- **`trigger_event`**
  - **Purpose**: Fires a specific event ID through the command dispatcher.
  - **Usage**: Use this to test event bindings or trigger logic paths live in the console. (Requires an active WebSocket connection to the engine).
- **`set_rtpc_value`**
  - **Purpose**: Forcibly overrides an RTPC (Real-Time Parameter Control) value.
  - **Usage**: Use this to interactively adjust game parameters (like player speed, health, or distance) and monitor how the engine reacts without hardcoding values in a script.

### Static Configuration

These tools do not require a live WebSocket connection. They operate directly on the static file structures of a SceneGrid workspace, aiding in initial configuration and structure validation.

- **`validate_configurations`**
  - **Purpose**: Runs a provided JSON configuration payload against the strict `ConsistencyChecker` rules (such as checking for Routing Cycles, Valid Parent Buses, Sound Maps, etc.).
  - **Usage**: Call this before saving a configuration payload to ensure it conforms to the `scenegrid-console` strict validation requirements.

## Getting Started

1. Boot the MCP server:
   ```bash
   npm run dev -w packages/mcp-server
   ```
2. In your `scenegrid-console` integration, boot the engine with the `remoteSyncUri` configuration:
   ```ts
   const audio = new AudioEngine({
       // ... other config ...
       remoteSyncUri: 'ws://localhost:8081' 
   });
   ```
3. Connect your MCP-compatible assistant and explore the tools.
