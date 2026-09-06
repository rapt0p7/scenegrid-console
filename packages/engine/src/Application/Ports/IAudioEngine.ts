import type { IAudioEngineConfig } from '@application/Ports/IAudioEngineConfig.js';
import type { BankState } from '@domain/Configuration/Ports/IBankConfig.js';
import type { IPlayOptions } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { AudioEngineEvents } from '@domain/Events/Ports/IEngineEvents.js';
import type { ITransitionToParameters } from '@domain/Orchestration/Ports/ISequencer.js';
import type { PlaybackId, DeepReadonly, QuantizeType } from '@scene-grid/shared';
import type { Handler } from 'mitt';

import {
    AutocompleteBank,
    AutocompleteEvent,
    AutocompleteGameParam,
    AutocompleteSnapshot,
    AutocompleteSound
} from '@application/Ports/SceneGridRegistry.js';

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

    params: {
        set: (parameterName: AutocompleteGameParam, value: number) => void;
        get: (parameterName: AutocompleteGameParam) => number | undefined;
    };

    streams: {
        load(soundId: AutocompleteSound): Promise<void>;
        unload(soundId: AutocompleteSound): void;
    };

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
        setState: (snapshotName: AutocompleteSnapshot, durationMs?: number) => void;

        /**
         * Applies an overlay snapshot layer on top of the current mix state.
         *
         * Useful for transient gameplay states (e.g. stun, pause, distortion effects).
         *
         * @param snapshotName - Snapshot modifier identifier.
         * @param id - Unique layer identifier for later removal.
         * @param priority - Layer priority (defaults to OVERLAY).
         */
        addModifier: (snapshotName: AutocompleteSnapshot, id: string, priority?: 100) => void;
        /**
         * Removes a previously applied snapshot modifier layer.
         *
         * @param id - Identifier of the modifier layer to remove.
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
        playLoop: (soundId: AutocompleteSound, region: string) => void;

        /**
         * Stops a looping music track.
         *
         * @param soundId Music track identifier.
         */
        stopLoop: (soundId: AutocompleteSound) => void;

        /**
         * Plays a stinger with optional quantization and reference track.
         *
         * @param stingerId Stinger identifier.
         * @param quantize Quantization mode.
         * @param referenceTrackId Optional reference track.
         */
        playStinger: (
            stingerId: AutocompleteSound,
            quantize: QuantizeType,
            referenceTrackId?: AutocompleteSound
        ) => void;

        /**
         * Performs a quantized transition between music regions.
         *
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
        setListenerOrientation: (
            orientation: DeepReadonly<{
                fx: number;
                fy: number;
                fz: number;
                ux: number;
                uy: number;
                uz: number;
            }>
        ) => void;

        /**
         * Sets world position for a playing sound instance.
         *
         * Supports both single playback instances and polyphonic playback groups.
         *
         * @param playbackId Playback instance identifier.
         * @param x World X coordinate.
         * @param y World Y coordinate.
         * @param z World Z coordinate.
         */
        setSoundPosition: (options: { playbackId: PlaybackId | PlaybackId[]; x: number; y: number; z: number }) => void;
    };

    /**
     * Bank loading and lifecycle management API.
     *
     * Provides dynamic audio resource streaming control.
     */
    readonly banks: {
        /**
         * Loads an audio bank.
         *
         * @param bankId Bank identifier.
         */
        load: (bankId: AutocompleteBank) => Promise<void>;

        /**
         * Unloads an audio bank and releases associated resources.
         *
         * @param bankId Bank identifier.
         */
        unload: (bankId: AutocompleteBank) => void;

        /**
         * Returns current bank loading state.
         *
         * @param bankId Bank identifier.
         */
        getState: (bankId: AutocompleteBank) => BankState;
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
    play(soundId: AutocompleteSound, options?: DeepReadonly<IPlayOptions>): PlaybackId | PlaybackId[] | null;

    /**
     * Stops playback by instance or sound identifier.
     *
     * @param playbackIdOrSoundId - Branded identifier of a sound defined in the manifest.
     */
    stop(playbackIdOrSoundId: PlaybackId | PlaybackId[] | AutocompleteSound): void;

    /**
     * Pauses playback by instance or sound identifier.
     */
    pause(playbackIdOrSoundId: PlaybackId | PlaybackId[] | AutocompleteSound): void;

    /**
     * Resumes playback by instance or sound identifier.
     *
     * @param playbackIdOrSoundId - Branded identifier of a sound defined in the manifest.
     */
    resume(playbackIdOrSoundId: PlaybackId | PlaybackId[] | AutocompleteSound): void;

    /**
     * Primary entry point for dispatching gameplay audio events (data-driven event system).
     * Delegates execution to the AudioEventOrchestrator domain service, ensuring command-only semantics (CQS).
     *
     * @param eventId - Branded identifier of the event (e.g. 'WEAPON_FIRE').
     * Raw string identifiers are intentionally disallowed by the type system.
     */
    postEvent(eventId: AutocompleteEvent): void;
}
