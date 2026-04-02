import mitt from 'mitt';

import type { AudioEngineEvents } from '../interfaces/IEngineEvents.js';
import type { Emitter, Handler } from 'mitt';

export class EngineEventDispatcher {
    readonly #emitter: Emitter<AudioEngineEvents> = mitt<AudioEngineEvents>();

    public on<K extends keyof AudioEngineEvents>(type: K, handler: Handler<AudioEngineEvents[K]>): void {
        this.#emitter.on(type, handler);
    }

    public off<K extends keyof AudioEngineEvents>(type: K, handler?: Handler<AudioEngineEvents[K]>): void {
        this.#emitter.off(type, handler);
    }

    public once<K extends keyof AudioEngineEvents>(type: K, handler: Handler<AudioEngineEvents[K]>): void {
        const onceHandler: Handler<AudioEngineEvents[K]> = event => {
            this.#emitter.off(type, onceHandler);
            handler(event);
        };
        this.#emitter.on(type, onceHandler);
    }

    public clear(): void {
        this.#emitter.all.clear();
    }

    /** @internal */
    public emit<T extends keyof AudioEngineEvents>(type: T, event: AudioEngineEvents[T]): void {
        this.#emitter.emit(type, event);
    }
}
