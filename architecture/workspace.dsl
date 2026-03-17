workspace "SceneGrid Console" "Audio Engine Architecture based on Web Audio API" {

    model {
        user = person "Game Client / UI" "Initiator of audio events and parameter changes."

        audioSystem = softwareSystem "Virtual Audio Mixing System" {

            // --- API & Routing Layer ---
            api = container "Engine API & Router" "AudioEngine, AudioRouter" "TypeScript" "Entry point. Resolves SoundMaps and manages high-level orchestration."
            registry = container "Config Registry" "SoundRegistry, SoundMap" "Data Store" "Stores configurations for sounds, buses, and presets." {
                tags "Data Store"
            }

            // --- Domain Managers ---
            logic = container "Domain Logic Managers" "ContainerManager, DuckingManager" "TypeScript" "Handles variations, container queues, and ducking logic."
            mixer = container "Mixer Manager" "MixerStateManager, Coordinator" "TypeScript" "Manages multi-layered mixes and state snapshots."
            scheduler = container "Music & Playback Scheduler" "SmartLoopManager, PlaybackScheduler" "TypeScript" "Grid synchronization, musical scheduling, and Voice Culling."
            rtpc = container "Modulation Manager" "RTPCManager, InstanceRTPCBinder" "TypeScript" "Binds game parameters to macro-buses and instances (RTPC)."

            // --- Voice Management ---
            controller = container "Voice Controller" "SoundController" "TypeScript" "Manages instance lifecycles and resource pooling."

            // --- WebAudio Core ---
            coreInstances = container "Sound Instances" "SoundInstance, SoundPool" "TypeScript" "Manages the local graph of an individual voice."
            topology = container "Node Topology" "NodeChain, AudioNodeFactory" "TypeScript" "Constructs isolated node graphs (Panner, Filter, Gain) for voices."

            buses = container "Audio Bus System" "AudioBus, AutomationEngine" "TypeScript" "Hierarchical group channels with sample-accurate automation and insert filters."

            output = container "Master Output" "MasterOutput, TinyLimiter, silentTail" "TypeScript / Worklets" "Final limiting, summation, and a silent track for DSP analysis."

            // --- Internal Relations ---
            api -> registry "Queries sound and bus configurations"
            api -> mixer "Switches mix states (layers)"
            api -> controller "Sends final execution commands"

            api -> logic "Uses for asset selection (Containers) and ducking"
            api -> rtpc "Initiates parameter binding"

            scheduler -> controller "Schedules execution based on absolute time"

            mixer -> buses "Applies snapshots and automates inputGain"
            rtpc -> buses "Modulates macro-parameters (VCA, Filter, Pan, Sends)"
            rtpc -> coreInstances "Modulates micro-parameters (Pitch, local Gain)"

            logic -> output "DuckingManager analyzes RMS via Worklet on silentTail"
            logic -> buses "DuckingManager dynamically reduces gain on target buses (Lookahead)"

            controller -> coreInstances "Activates/deactivates instances (SoundPool)"
            coreInstances -> topology "Requests local graph construction"

            topology -> buses "Routes signal (Main + Sends) to group buses"
            buses -> output "Passes summed signal to Master Output"
        }

        webAudioApi = softwareSystem "Web Audio API" "Native browser infrastructure" {
            tags "External"
        }

        // --- External Relations ---
        user -> api "Calls play/stop/setState/setRTPC"
        output -> webAudioApi "Passes signal to AudioDestination"
    }

    views {
        container audioSystem "Containers" "Container diagram for the SceneGrid Console" {
            include *
            autolayout lr
        }

        styles {
            element "Container" {
                background #438dd5
                color #ffffff
            }

            element "Data Store" {
                shape Cylinder
                background #1168bd
            }

            element "External" {
                background #999999
                color #ffffff
            }
        }
    }
}
