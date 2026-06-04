import type { IAudioEngineConfig } from '@application/Ports/IAudioEngineConfig.js';
import type { IPlayOptions } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { AudioEngineEvents } from '@domain/Events/Ports/IEngineEvents.js';
import type { ITransitionToParameters } from '@domain/Orchestration/Ports/ISequencer.js';
import type { PlaybackId, SoundId, DeepReadonly, QuantizeType } from '@scene-grid/shared';
import type { Handler } from 'mitt';

export interface InitParameters {
    readonly isStrictValidation?: boolean;
}

/**
 * AudioEngine
 *
 * The primary facade (Composition Root) of the SceneGrid Console audio engine.
 * APPLICATION LAYER (Layer 4).
 *
 * This module encapsulates full engine initialization and hides all internal systems:
 * Web Audio graph, routing, mixing, RTPC, sequencing, and orchestration layers.
 *
 * The public API is designed as a Deep Module (Ousterhout style):
 * consumers interact with high-level operations instead of low-level audio primitives.
 */
export interface IAudioEngine {
    /**
     * Event system for engine lifecycle and runtime notifications.
     */
    events: {
        on: <K extends keyof AudioEngineEvents>(type: K, handler: Handler<AudioEngineEvents[K]>) => void;
        off: <K extends keyof AudioEngineEvents>(type: K, handler?: Handler<AudioEngineEvents[K]>) => void;
        once: <K extends keyof AudioEngineEvents>(type: K, handler: Handler<AudioEngineEvents[K]>) => void;
        clear: () => void;
    };
    params: { set: (parameterName: string, value: number) => void; get: (parameterName: string) => any };
    /**
     * Mixer control interface (VCA snapshot system).
     *
     * Provides isolated access to mixer state orchestration (MixerCoordinator, MixerLayerStack).
     */
    mixer: {
        /**
         * Sets base mixer snapshot state.
         * @param snapshotName Snapshot identifier.
         * @param durationMs Optional crossfade duration in milliseconds.
         */
        setState: (snapshotName: string) => void;
        /**
         * Applies an overlay snapshot layer on top of the current mix state.
         *
         * Useful for transient gameplay states (e.g. stun, pause, distortion effects).
         *
         * @param snapshotId - Snapshot modifier identifier.
         * @param modifierId - Unique layer identifier for later removal.
         * @param priority - Layer priority (defaults to OVERLAY).
         */
        addModifier: (snapshotName: string, id: string, priority?: 100) => void;
        /**
         * Removes a previously applied snapshot modifier layer.
         *
         * @param modifierId - Identifier of the modifier layer to remove.
         */
        removeModifier: (id: string) => void;
    };

    /**
     * Interactive music orchestration API (horizontal sequencing system).
     *
     * Delegates execution to a stateless Sequencer service.
     */
    music: {
        /**
         * Starts a smart loop playback from a specified audio region.
         *
         * @param soundId - Music track identifier (SmartLoopSoundConfig).
         * @param region - Initial playback region identifier.
         */
        playLoop: (soundId: string, region: string) => void;
        /**
         * Stops a looping music track.
         * @param soundId Music track identifier.
         */
        stopLoop: (soundId: string) => void;
        /**
         * Plays a stinger with optional quantization and reference track.
         * @param stingerId Stinger identifier.
         * @param quantize Quantization mode.
         * @param referenceTrackId Optional reference track.
         */
        playStinger: (stingerId: string, quantize: QuantizeType, referenceTrackId?: SoundId) => void;
        /**
         * Performs a quantized transition between music regions.
         * @param options Transition configuration.
         */
        transitionTo: (options: ITransitionToParameters) => void;
    };
    /**
     * 3D spatial audio interface.
     */
    spatial: {
        /**
         * Sets listener world position.
         */
        setListenerPosition: (x: number, y: number, z: number) => void;
        /**
         * Sets listener orientation vectors.
         */
        setListenerOrientation: ({
            fx,
            fy,
            fz,
            ux,
            uy,
            uz
        }: DeepReadonly<{
            fx: number;
            fy: number;
            fz: number;
            ux: number;
            uy: number;
            uz: number;
        }>) => void;
    };
    /**
     * Immutable engine configuration snapshot.
     */
    config: Readonly<IAudioEngineConfig>;
    /**
     * Initializes the audio engine.
     *
     * This is the only stage where the full dependency graph is constructed.
     *
     * @param parameters Optional initialization parameters.
     */
    init(parameters?: InitParameters): Promise<void>;
    /**
     * Resumes audio context (user gesture unlock flow).
     */
    unlock(): Promise<void>;
    /**
     * Suspends audio context.
     */
    suspend(): Promise<void>;
    /**
     * Low-level API for triggering a specific audio asset directly.
     * Prefer using postEvent() for higher-level gameplay logic and orchestration.
     *
     * @param soundId - Branded identifier of a sound, container, or switch defined in the manifest.
     * @param options - Optional playback parameters (volume, pitch, offset, etc.).
     *
     * @returns PlaybackId (or array of PlaybackIds for polyphonic outputs),
     * or null if the sound is rejected by the voice management / culling system.
     */
    play(soundId: string, options?: DeepReadonly<IPlayOptions>): PlaybackId | PlaybackId[] | null;
    /**
     * Stops playback by instance or sound identifier.
     *
     * @param playbackIdOrSoundId - Branded identifier of a sound defined in the manifest.
     */
    stop(playbackIdOrSoundId: PlaybackId | PlaybackId[] | string): void;
    /**
     * Pauses playback by instance or sound identifier.
     */
    pause(playbackIdOrSoundId: PlaybackId | PlaybackId[] | SoundId): void;
    /**
     * Resumes playback by instance or sound identifier.
     *
     * @param playbackIdOrSoundId - Branded identifier of a sound defined in the manifest.
     */
    resume(playbackIdOrSoundId: PlaybackId | PlaybackId[] | SoundId): void;
    /**
     * Primary entry point for dispatching gameplay audio events (data-driven event system).
     * Delegates execution to the AudioEventOrchestrator domain service, ensuring command-only semantics (CQS).
     *
     * @param eventId - Branded identifier of the event (e.g. 'WEAPON_FIRE').
     * Raw string identifiers are intentionally disallowed by the type system.
     */
    postEvent(eventId: string): void;
}
