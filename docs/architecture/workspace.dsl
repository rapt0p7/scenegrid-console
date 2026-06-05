workspace "SceneGrid Platform" "Hexagonal Audio Engine Monorepo Architecture" {

    model {
        user = person "Game Client / UI" "Initiator of audio events and parameter changes."
        audioEngineer = person "Audio Engineer" "Uses DevTools to monitor and debug the mix."

        webAudioApi = softwareSystem "Web Audio API" "Native browser infrastructure" {
            tags "External"
        }

        audioSystem = softwareSystem "SceneGrid Ecosystem" {

            // --- Standalone Packages ---
            shared = container "Shared Package" "@scene-grid/shared" "TypeScript" "Mathematical curves, guards, and shared constants." {
                tags "Shared"
            }

            inspector = container "Inspector Package" "@scene-grid/inspector" "TypeScript / UI" "Standalone visual debugger, profiler, and telemetry UI." {
                tags "Inspector"
            }

            // --- Engine Package (@scene-grid/engine) Layers ---
            kernel = container "Kernel Layer" "@scene-grid/engine" "TypeScript" "High-performance mathematical implementations." {
                tags "Kernel"
                rtpcManager = component "RTPC Manager" "Implements IRTPCAdapter Port for complex modulation math."
            }

            domain = container "Domain Layer" "@scene-grid/engine" "TypeScript" "The 'Golden Circle'. Pure logic & Port definitions." {
                tags "Domain"
                registry = component "Sound Registry" "Configuration and manifest resolution logic."
                mixer = component "Mixer Logic" "Multi-layered mix state and snapshot resolution."
                router = component "Audio Router" "Logical path calculation for audio signals."
                logic = component "Domain Managers" "Logic for ducking, variations, and container management."
                orchestration = component "Orchestration" "Musical timing, grid logic, and synchronization."
                culling = component "Voice Culling System" "Business logic for sound prioritization and virtualization."
            }

            infra = container "Infrastructure Layer" "@scene-grid/engine" "TypeScript" "Technical implementation of Domain Ports." {
                tags "Infrastructure"
                webAudioBus = component "Bus Adapter" "Implementation of IAudioBusSystem using Web Audio API."
                dsp = component "DSP Adapters" "Filters, Limiters, and AudioWorklet processors."
                voices = component "Voice Management" "SoundPool and SoundInstance lifecycle management."
                output = component "Master Output" "Final signal summation and routing to Native Destination."
            }

            app = container "Application Layer" "@scene-grid/engine" "TypeScript" "Coordinates high-level use cases and system bootstrapping." {
                tags "Application"
            }

            // --- Cross-Package Dependencies (The Monorepo Links) ---
            inspector -> app "Subscribes to telemetry events and reads engine state"
            inspector -> shared "Uses math utilities and shared types"

            // --- Hexagonal Dependency Inversion ---
            infra -> domain "Implements Domain Ports (e.g. IAudioBusSystem, ISoundController)"
            kernel -> domain "Implements Modulation Port (IRTPCAdapter)"

            // --- Application Flow ---
            app -> domain "Triggers domain use cases"
            app -> infra "Instantiates and bootstraps technical adapters"
            app -> kernel "Updates global modulation parameters"

            // --- Internal Signal Path ---
            voices -> webAudioBus "Routes voice signals to"
            webAudioBus -> dsp "Processes bus signals via"
            dsp -> output "Sends processed audio to"

            // --- Shared Layer usage ---
            domain -> shared "Uses utilities and guards"
            infra -> shared "Uses math and constants"
            kernel -> shared "Uses curve definitions"
            app -> shared "Uses common types"
        }

        user -> app "Calls play(), setState(), setRTPC()"
        audioEngineer -> inspector "Monitors metrics and debugs routing via UI"
        output -> webAudioApi "Passes signal to AudioDestination"
    }

    views {
        container audioSystem "Containers" "Monorepo Architecture Overview" {
            include *
            autolayout lr
        }

        component domain "DomainComponents" "Internal components of the Domain Layer" {
            include *
            autolayout lr
        }

        component infra "InfraComponents" "Internal components of the Infrastructure Layer" {
            include *
            autolayout lr
        }

        styles {
            element "Element" {
                color #ffffff
            }

            element "Container" {
                background #438dd5
                color #ffffff
            }

            element "Component" {
                background #85bbf0
                color #000000
            }

            element "External" {
                background #999999
                color #ffffff
            }

            element "Domain" {
                shape Hexagon
                stroke #f5da42
                strokeWidth 3
            }

            element "Infrastructure" {
                background #6f42c1
            }

            element "Application" {
                background #2ecc71
            }

            element "Kernel" {
                background #e67e22
            }

            element "Shared" {
                background #7f8c8d
            }

            element "Inspector" {
                background #e84393
            }

            element "Person" {
                shape Person
                background #08427b
                color #ffffff
            }
        }
    }
}
