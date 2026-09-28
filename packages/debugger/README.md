# @scene-grid/debugger

> Embedded in-game Tweakpane diagnostic UI for debugging the SceneGrid audio engine

[![npm version](https://badge.fury.io/js/@scene-grid%2Fdebugger.svg)](https://badge.fury.io/js/@scene-grid%2Fdebugger)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`@scene-grid/debugger` is a lightweight, floating UI overlay (powered by Tweakpane) that attaches directly to a running `@scene-grid/engine` instance. It provides instant in-game access to test RTPCs, spatial audio panning, events, and smart loops without needing to run a separate inspector application.

## Installation

```bash
npm install -D @scene-grid/debugger
```
*Note: Ensure you also have `tweakpane`, `@tweakpane/core`, and `@tweakpane/plugin-essentials` installed as they are peer dependencies.*

## Quick Start

Because debugging tools shouldn't bloat your production bundle, it is highly recommended to dynamically import the debugger only during development.

```typescript
import { AudioEngine, WorkletLoader } from '@scene-grid/engine';

const audio = new AudioEngine({ /* config */ });
await audio.init();

// Dynamically inject the debug UI only in non-production environments
if (process.env.NODE_ENV !== 'production') {
    import('@scene-grid/debugger').then(({ attachDebugUI, initAudioDebugPanel }) => {
        // Attaches the debug canvas overlay (e.g., for spatial visualizers)
        attachDebugUI(audio, { 
            wrapperSelector: '#wrapper', // Your game's main container
            workletLoader: WorkletLoader 
        });
        
        // Initializes the floating Tweakpane panel
        initAudioDebugPanel(audio);
    });
}
```

## How It Works

The debugger directly accesses the engine's internal `_debug` endpoints and `busSystem` to manipulate audio nodes and spatial coordinates on the fly. It executes in the same browser window and UI thread as your game.

## Core Features

* **RTPC Sliders**: Real-time manipulation of Game Parameters.
* **Spatial Audio (2D)**: Instantly test sound positions and panning behavior.
* **Smart Loop Transport**: Trigger interactive music transitions and verify quantization behavior.
* **Polyphony / Voice Stats**: Quick readout of active voices.

## License
MIT © Igor Zabrodin
