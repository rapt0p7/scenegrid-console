## General System Positioning

The system is a **virtual digital mixing console** featuring a fixed signal path architecture, precision automation, and support for multi-layered mix states.

Conceptually, it is a hybrid of:
* A DAW mixer
* A game audio engine
* A console with recall scenes
---
![image](./architecture/containers.svg)
![image](./architecture/infra-components.svg)

**Facade and Configuration Management (Engine API)**
Interaction between the client application and the audio engine occurs through a single facade (`AudioEngine`). The system operates on a **Data-Driven** principle: all routing, macro, and bus settings are initialized via a centralized manifest registry (**`SoundRegistry`**), decoupling playback logic from hardcoded values.

---

## 0. Architectural Philosophy: Ports & Adapters

To ensure long-term maintainability and testability, the system follows a **Hexagonal (Ports and Adapters)** pattern.

* **Logic vs. Implementation:** The logic of how a signal *should* flow (Domain) is separated from the creation of `GainNode` or `AudioWorklet` (Infrastructure).
* **Modularity:** You can theoretically replace the Web Audio implementation with a different backend without modifying the `MixerStateManager` or `SoundRegistry`.

---

### 1. Signal Flow Architecture

**Core Principle**
Signals follow a strict hierarchy:
**Source → Individual Channel → Group Bus → Master** No bypass routes are permitted.
* **Logical Routing (Domain):** The `AudioRouter` calculates the signal path based on the manifest. It deals with abstract entities like "Buses" and "Voices".
* **Physical Routing (Infrastructure):** The `AudioBusSystem` and `SoundController` receive commands from the Domain and physically connect `GainNodes` and `Filters`.

**Sources (Voices)**
Each sound:
* Is fully isolated with its own local processing chain.
* Does not affect other voices.
* Is managed by a **Zero-Allocation Object Pool** (free-list stack), ensuring $O(1)$ access time and eliminating Garbage Collection (GC) spikes during heavy gameplay.

This guarantees an absence of phase conflicts, stable dynamic processing, and predictable routing.

**Voice Culling (Polyphony Optimization)**
A Voice Culling mechanism is implemented at the core level. The `PlaybackScheduler` and domain-driven `VoiceCullingArbiter` continuously monitor active voice limits. To prevent Audio Thread overload, the `CullingRunner` seamlessly virtualizes the lowest-priority or quietest sounds, thus maintaining strictly deterministic CPU load and FPS stability.

**Audio Buses**
Buses function like **console group channels**.
Key properties:
* Fixed channel strip structure
* Routing is defined only once at the sound's start
* If no route is defined, the signal is blocked

This eliminates accidental connections, double-summing, and uncontrolled output to the master.

**Master Section**
The sole exit point to the audio device. It contains:
* Master fader
* Brickwall limiter
* A dedicated **`silentTail`** (zero volume) that ensures continuous operation of DSP processors (sidechain detectors and analyzers) without leaking their audio into the mix.

![image](./audio-flow.svg)

---

### 2. Bus Channel Strip Structure

Each bus features a standard processing path:

1.  **Input Gain (`inputGain`)**: The main fader; the point for automation (snapshots, RTPC), sidechain control, and primary level management.
2.  **Pre-Filter / Lookahead (`preFilterGain`)**: An insertion point for micro-delay used in predictive sidechaining. Ensures clean compression attack without digital clicks.
3.  **Insert Filter (`filter`)**: A universal filter (equivalent to an insert EQ). Implemented via an isolated **plugin architecture (`FiltersPlugin`)** supporting "Safe Swaps" without artifacts and smooth graph reconfiguration.
4.  **Post-Gain (`postFilterGain`)**: The final stabilization stage; serves as the **Tap Point** for the Sends system and metric collection for visualizers.

---

### 3. Sidechain and Dynamic Processing

The system supports **lookahead bus ducking** powered by `AudioWorklet`, featuring built-in cascade protection.

**Operational Features**
* **Trigger Summing**: Multiple trigger signals are summed in the **`mergeGain`** node.
* **Hard Clipping Protection**: To prevent math breakdowns during heavy cascade events (e.g., simultaneous explosions), a **`WaveShaperNode`** safely clamps overlapping triggers to a strict $[-1.0, 1.0]$ range before analysis.
* **Envelope Analysis**: A specialized **`ducker-processor`** calculates the RMS envelope of the clamped signal.
* **Predictive Attenuation**: When sidechaining is active, a **`DelayNode`** (Lookahead) is dynamically inserted into the bus path. Suppression occurs **before the peak**, resulting in a clean attack without digital pops.

---

### 4. Snapshots and Automation (Total Recall)

The system supports a **complete recall of the mixer state** using a VCA (Voltage-Controlled Amplifier) multiplication model.

**VCA-Style Snapshots**
Instead of simple value overrides, the mixer uses mathematically scaled snapshots:
* The base configuration (`IBuses`) acts as the master fader.
* Snapshots act as modulators.
* $FinalGain = BaseGain \times SnapshotGain \times RTPCGain$

This ensures predictable scaling when multiple mix states overlap.

**State Transitioning**
Transitions are seamless: all changes are ramped with sample-accurate precision to exclude clicks or level jumps. The system implements **Zero-Latency Cold Start Protection**, forcing instant application (`durationMs: 0`) of the initial snapshot to prevent audio bursts upon engine initialization.

**Safe Filter Swapping**
When changing filter types, the system performs a brief fade-out, rebuilds the graph, and then fades in, preventing digital artifacts.

---

### 5. Multi-Layer Mix Logic

The mixer supports **state layers**, analogous to theater console scenes or DAW automation layers.

**The Purpose of Layers**
They allow independent management of: music, SFX, UI sounds, and various game contexts.

**Mix Finalization**
1. Active layers are safely superimposed using the VCA multiplication model.
2. The `MixerTransitionEngine` calculates the final transition ramps and parameters.
3. Values are committed to the automation engine for sample-accurate interpolation.

---

### 6. Interactive Music: Horizontal vs. Vertical

The system natively supports professional interactive music patterns, strictly separating horizontal sequencing from vertical intensity.

**Horizontal Sequencing (The `Sequencer`)**
Instead of triggering multiple separate files, the `Sequencer` (formerly SmartLoopManager) works with audio sprites (regions) within a single media file to manage musical time.
Key capabilities:
* Gapless looping of specific musical regions.
* **Seamless Transitions:** Supports instant swaps, grid-quantized jumps (BPM/Bar), and intermediate fill/stinger playback.
* **Local Crossfades:** Blending regions occurs strictly at the individual channel level (`NodeChain`), preserving global bus automation.

**Vertical Layering (Snapshots & RTPC)**
Dynamic intensity (e.g., adding percussion or brass during combat) is **not** handled by the Sequencer. Vertical music is achieved entirely through the `MixerTransitionEngine` and `RTPCManager`:
* Stems are routed to dedicated buses.
* Game logic pushes Snapshots or drives RTPC curves to fade stem buses in and out dynamically, keeping vertical mix states completely decoupled from timeline logic.

---

### 7. Sends and Parallel Routing (Auxiliary Sends)

In addition to direct hierarchical routing, the system provides a parallel routing mechanism via Sends, acting as the DAW equivalent of **Aux Sends**.

**1. Architecture and Signal Flow**
Within the strict isolation of the graph, the Sends system maintains the core invariant: no bypass routes to the physical output. A Send is a controlled branch of the signal from one bus to another (FX / Return Bus).
* **Tap Point**: Send control is managed via a dedicated `GainNode`. Signal tapping occurs **Post-Filter** (from the `postFilterGain` node of the source bus), meaning the signal is sent to the FX bus with local EQ applied.
* **Routing**: The branched signal is routed strictly to the input node of the target bus, which processes it and outputs it to the `MasterOutput` normally.

**2. Use Cases**
* **Shared FX (Reverb/Delay)**: Significantly reduces CPU load by avoiding duplicate heavy effects on every voice.
* **Parallel Compression (New York Compression)**: Summing dry and processed signals in the `MasterOutput`.
* **Dynamic Spatial Morphing**: Dynamically changing send levels based on game state changes.

---

### 8. Real-Time Parameter Control (RTPCManager)

The RTPC mechanism acts as a **virtual patchbay** for control signals (Control Voltage / Macros). It links "dry" game data (speed, distance, health) to the physical parameters of the audio path in real-time, utilizing advanced performance throttling and mathematical presets.

**1. The Macro Control Hub & Centralized Ticker**
Instead of the game engine directly manipulating Web Audio API faders at frame rate, it sends values to the `RTPCManager`. The manager is driven by a centralized `EngineTicker` and utilizes microtask batching (`flush`) to protect the main thread and Audio Context from event spam.

**2. Global Manifest & Slew Rates (Inertia)**
Designers define FPS-independent inertia (`attackMs` / `releaseMs`) and default values in a global `RTPCManifest`. This ensures parameters transition smoothly over time (e.g., health drops instantly but regenerates slowly) without requiring manual smoothing on every sound.

**3. Mathematical Presets & Custom Curves**
The system uses an advanced `MathCurveDefinition` evaluator for mapping values:
* **Presets**: Built-in support for `linear`, `exponential`, `logarithmic`, and `s-curve` mappings.
* **Piecewise Linear Curves**: Support for custom coordinate arrays $(x, y)$ for complex shape definitions.

**4. Instance Control (Micro-Modulation)**
Independent parameter control for a specific sound instance without affecting the entire bus.
* **Target Parameters**: Pitch, local gain, pan, and filter frequency.
* **Sample-Accurate Smoothing**: DSP-level de-zippering to prevent audio clicks during parameter updates.

**5. Bus-Level Control (VCA)**
RTPC can be patched to 4 key elements:
1.  **VCA Level (`gain`)**: Dynamic bus volume.
2.  **Filter Cutoff (`filterFrequency`)**: Insert filter frequency.
3.  **Panning (`pan`)**: Group-wide stereo positioning.
4.  **Aux Send Level (`sendLevel`)**: Dynamic control of parallel FX levels.

---

### 9. Monitoring and Analysis

The system supports RMS meters, spectrum analyzers, and DSP detectors. These are implemented as independent **AudioWorklet Plugins** (e.g., `MeterProcessor`) operating via the `silentTail` path:
* They do not color the sound.
* They do not affect phase.
* They do not increase main mix latency.

---

### 10. Stability Guarantees (System Invariants)

The following are **strictly prohibited**:
* Direct source connection to the Master.
* Bypassing automation.
* Manual parameter management outside the system.
* **Domain Isolation:** Domain components must never import anything from the `Infrastructure` or `Application` directories. Communication with external systems must occur through **Ports** (interfaces).
* **Inward Dependency:** Dependencies must always point towards the Domain. The Domain is the most stable part of the system and is agnostic of the Web Audio API or the browser environment.
* **Kernel Purity:** The Kernel layer should have zero dependencies on external state, acting as a pure mathematical engine for the engine's modulation needs.
* **Synchronous Parameter Spam**: High-frequency game ticks must pass through the `RTPCManager`'s batching system; direct, unthrottled manipulation of AudioParams is prevented by design.

This ensures mix predictability, prevents automation conflicts, protects CPU resources, and maintains DSP stability.
