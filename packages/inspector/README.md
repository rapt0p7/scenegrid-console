# @scene-grid/inspector

> Real-time telemetry and visual inspector interface for SceneGrid

[![npm version](https://badge.fury.io/js/@scene-grid%2Finspector.svg)](https://badge.fury.io/js/@scene-grid%2Finspector)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`@scene-grid/inspector` is a comprehensive, standalone React application for deep telemetry analysis of the `@scene-grid/engine`. It transforms opaque audio behavior into a highly observable, transparent graph, allowing developers to debug memory leaks, phase coherence issues, and routing visually.

*(Looking for the in-game floating Tweakpane UI? See [`@scene-grid/debugger`](https://www.npmjs.com/package/@scene-grid/debugger))*

## Installation

```bash
npm install -D @scene-grid/inspector
```
*Note: This package requires `react` and `react-dom` as peer dependencies.*

## Quick Start

The Inspector is distributed as a side-effecting React application that automatically mounts itself to a specific DOM node.

Because it connects to your game engine via an HTML5 `SharedWorker`, it runs entirely in a separate browser tab while maintaining real-time communication with **zero networking overhead**—as long as both tabs share the same origin (e.g., `localhost`).

Create an `inspector.html` file in your project's `public/` directory (or configure your dev server to serve it):

```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8" />
    <title>SceneGrid Audio Inspector</title>
    <style>
        body { margin: 0; padding: 0; background: #1e1e1e; color: white; }
    </style>
</head>
<body>
    <!-- The React app will automatically mount here -->
    <div id="inspector-root"></div>

    <!-- Import the inspector bundle -->
    <script type="module">
        import '@scene-grid/inspector';
    </script>
</body>
</html>
```

Open `http://localhost:<YOUR_PORT>/inspector.html` in a new tab alongside your game.

## How It Works

* **Telemetry Observer**: Connects to the engine's `TelemetryWorker` via native `MessagePort`s and receives standardized JSON telemetry frames (`LIFECYCLE`, `CAUSE_CHAIN`, `SNAPSHOT`, `RAM_REPORT`).
* **Throttling & Buffering**: Audio state can change thousands of times per second (e.g., during rapid RTPC parameter sweeps). The Inspector applies strict debouncing and throttling via an internal telemetry store (`useTelemetryBus`) to prevent React from re-rendering out of control.
* **Visualization**: Updates the `AudioGraph` (mapping nodes and edges), `PolyphonyCounter` (tracking active voices), and the `TimelineScrubber` (visualizing Snapshot transitions).

## Core Features

* **Visual Audio Graph**: Dynamically renders the active signal routing, sidechain inputs, and processing chain.
* **Polyphony Monitoring**: Tracks active physical voices against logical limits and visualizes culling behavior live.
* **Timeline Scrubber**: Inspect RTPC curves and Mixer Snapshot crossfades in real-time to verify mathematical transitions.

## License
MIT © Igor Zabrodin
