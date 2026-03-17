# Snapshot-Driven Virtual Mixing Console (SceneGrid Console)

> **Project Status:** Independent research project started ~mid 2025.

The **SceneGrid Console** is a high-performance, virtual digital mixing console built on the Web Audio API. It features a fixed signal path architecture, sample-accurate automation, and support for complex, multi-layered mix states.

Conceptually, the system bridges the gap between:
* **DAW-style Mixers:** Professional-grade channel strips and routing.
* **Game Audio Engines:** Data-driven triggering and dynamic resource management.
* **Hardware Consoles:** Total recall capabilities via snapshots and scenes.

---

## 1. System Architecture & Signal Flow

The system enforces a strict hierarchical flow to ensure phase coherence, predictable routing, and DSP stability. No bypass routes are permitted.

### The Core Hierarchy
**Source (Voice) → Individual Channel (NodeChain) → Group Bus → Master Output**

* **Isolated Sources (Voices):** Each sound is fully isolated with its own local processing chain, preventing phase conflicts and ensuring that one voice's processing never bleeds into another.
* **Voice Culling:** The `PlaybackScheduler` and `VoiceCullingSystem` monitor active voice limits. To maintain FPS stability and prevent Audio Thread overload, the system transparently terminates low-priority or silent sounds.
* **Audio Buses:** Function as group channels with a fixed channel strip structure. Routing is immutable once a sound starts, preventing "runaway" feedback or uncontrolled summing.

### Master Section
The single exit point to the hardware destination. It includes:
* A master fader and **Brickwall Limiter** (`TinyLimiterNode`).
* **`silentTail`:** A zero-volume output branch that keeps DSP processors (sidechain detectors, analyzers) active without leaking their internal "trigger" audio into the final mix.

---

## 2. The Channel Strip

Each Audio Bus implements a standardized processing chain:

| Stage | Node / Parameter | Function |
| :--- | :--- | :--- |
| **1. Input Gain** | `inputGain` | Main automation point for snapshots, RTPCs, and sidechaining. |
| **2. Pre-Filter** | `preFilterGain` | Insertion point for **Lookahead Delay**, providing clean compression attacks. |
| **3. Insert Filter** | `FiltersPlugin` | Supports "Safe Swap" logic—smoothly reconfiguring filters without digital clicks. |
| **4. Post-Gain** | `postFilterGain` | Final stabilization stage and the **Tap Point** for Sends and Visualizers. |

---

## 3. Advanced Audio Features

### Lookahead Sidechain Ducking
Powered by `AudioWorklet`, the system supports predictive ducking.
1.  **Trigger Summing:** Multiple sources sum into a `mergeGain` node.
2.  **Envelope Analysis:** The `ducker-processor` calculates the RMS envelope.
3.  **Predictive Attenuation:** A `DelayNode` is inserted into the target bus, allowing the gain to drop *before* the trigger peak for a pop-free, professional attack.

### SmartLoopManager (Interactive Music)
A professional-grade sequencing engine for horizontal music transitions:
* **Audio Sprites:** Seamlessly loops regions within a single file.
* **Quantized Transitions:** Syncs changes to a musical grid (BPM/Bar).
* **Clip-Level Crossfades:** Transitions happen within the `NodeChain`, keeping the main Bus automation free for global mix changes.

### Auxiliary Sends
Parallel routing allows for shared effects (e.g., a single Reverb bus for all SFX), significantly reducing CPU overhead. Tapping occurs **Post-Filter** to ensure processed audio is sent to the FX chain.

---

## 4. Total Recall & RTPC

### Snapshots & Layers
The system supports **Total Recall**. A snapshot captures every gain level, filter setting, and routing state.
* **Multi-Layer Logic:** Mix states can be layered (e.g., a "Combat Layer" atop a "Music Layer"), with the `MixerStateResolver` calculating the final automated values.

### RTPC (Real-Time Parameter Control)
A virtual patchbay connecting game data (speed, health, distance) to audio parameters.
* **Custom Curves:** Uses Piecewise Linear Curves for complex mapping (e.g., logarithmic distance attenuation).
* **Macro Modulation:** Patch RTPCs to VCA levels, Filter Cutoffs, Panning, or Send Levels.

---

## 5. Repository Structure

Based on the internal dependency graph:

```text
src/
├── AudioEngine.ts        # Primary API Facade
├── BusSystem/            # Bus logic and Channel Strip management
├── Core/                 # DSP (Sidechain, Limiters, Filters)
├── Managers/             # State, Snapshots, and RTPC Management
├── webaudio-core/        # Low-level Web Audio wrappers & Automation
└── helpers/              # Math, Visualizers, and Worklet Processors
```

---

## 6. System Invariants

To ensure absolute mix predictability, the following are strictly prohibited:
1.  **Direct Source-to-Master connection** (must go through a Bus).
2.  **Manual Parameter Control** outside of the Automation/RTPC system.
3.  **Feedback Loops** within the Sends system.

---

## Quick Start: System Initialization

The system follows a **Data-Driven** initialization pattern. This separates audio assets and bus configurations from playback logic, ensuring the engine is fully aware of the signal graph before any sound is triggered.

### Basic Bootstrap Example

The following example demonstrates how to configure the engine, initialize the registry, and unlock the `AudioContext` following a required user gesture.

```typescript
import { AudioEngine } from './src';
import { PRIORITY } from './src/Managers/MixerLayer';

// Configuration manifests
import Buses from './audio-config/Buses';
import Snapshots from './audio-config/Snapshots';
import SoundMap from './audio-config/SoundMap';
import soundManifest from './soundManifest';

async function bootstrap() {
    // 1. Instantiate the Engine with a centralized configuration
    const audio = new AudioEngine({
        manifest: soundManifest,    // Registry of all audio assets
        buses: Buses,              // Fixed bus architecture
        snapshots: Snapshots,      // Preset mixer states
        soundMap: SoundMap,        // Logical mapping of sounds to buses
        globalVoiceLimit: 32       // Polyphony limit for optimization
    });

    // 2. Initialize the Audio Registry and Worklet processors
    await audio.init();

    // 3. Browser Security: Unlock AudioContext via User Interaction
    globalThis.addEventListener('pointerup', async () => {
        // Required to resume the AudioContext on modern browsers
        await audio.unlock();

        // Optional: Initialize sidechain processors for specific buses
        audio.createSidechain('musicMain');
        audio.createSidechain('musicExplore');
        audio.createSidechain('musicCombat');
        audio.createSidechain('musicLounge');

        // 4. Set Initial Mix State (Snapshots)
        // Push the base state onto the mixer stack
        await audio.mixer.push('idle', 'base:idle', PRIORITY.BASE);

        // 5. Start Playback
        audio.play('backgroundMain', { isLoop: true });
        audio.play('backgroundMain2', { isLoop: true });
        audio.play('backgroundMain3', { isLoop: true });
    }, { once: true });
}

bootstrap().catch(console.error);
```

### Initialization Workflow

* **Centralized Registry (`SoundRegistry`):** All assets and routing must be defined during construction to maintain strict hierarchical flow.
* **Voice Culling:** Defining `globalVoiceLimit` allows the `PlaybackScheduler` to manage the Audio Thread load and maintain FPS stability from the start.
* **The Unlock Pattern:** The `.unlock()` method must be called within a user-initiated event (e.g., `pointerup`) to comply with browser autoplay policies.
* **Mixer Layers:** Use `audio.mixer.push()` to apply the initial gain and filter settings defined in your Snapshots.
* **Sidechain Creation:** Sidechains for target buses should be explicitly initialized after the engine is unlocked to correctly insert `DelayNodes` into the signal path.

---

## License

Copyright © 2025-2026 Igor Zabrodin.
Licensed under the **PolyForm Noncommercial License 1.0.0**. See the `LICENSE.md` file for details.

---
