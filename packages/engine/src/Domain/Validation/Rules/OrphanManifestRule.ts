// oxlint-disable max-depth max-lines-per-function
// noinspection D

import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import { isDefined, typedEntries } from '@scene-grid/shared';

export default class OrphanManifestRule implements IValidationRule {
    public validate(context: IValidationContext) {
        const referenced = new Set<string>();

        for (const [key, cfg] of typedEntries(context.config.soundMap || {})) {
            if (typeof cfg !== 'object' || cfg === null) continue;

            if (context.isLayered(cfg)) {
                const layers = cfg.layers;

                if (Array.isArray(layers)) {
                    for (const layer of layers) {
                        if (isDefined(layer) && isDefined(layer.src)) referenced.add(layer.src);
                    }
                }
            } else if (context.isContainer(cfg) || context.isScatterer(cfg)) {
                const sources = cfg.sources;

                if (Array.isArray(sources)) {
                    for (const source of sources) {
                        if (isDefined(source)) {
                            const targetId =
                                typeof source === 'string' ? source : (source as Record<string, unknown>).id;
                            referenced.add(targetId as string);
                        }
                    }
                }
            } else if (context.isSwitch(cfg)) {
                if (cfg.switches && typeof cfg.switches === 'object' && !Array.isArray(cfg.switches)) {
                    for (const targetId of Object.values(cfg.switches)) {
                        if (isDefined(targetId) && typeof targetId === 'string') {
                            referenced.add(targetId);
                        }
                    }
                }
                if (isDefined(cfg.defaultSwitch) && typeof cfg.defaultSwitch === 'string') {
                    referenced.add(cfg.defaultSwitch);
                }
            } else if (context.isSmartLoop(cfg)) {
                referenced.add(key);
            } else if ('src' in cfg && isDefined(cfg.src)) {
                referenced.add(cfg.src);
            } else if (key in (context.config.manifest || {})) {
                referenced.add(key);
            }
        }

        for (const key of Object.keys(context.config.manifest || {})) {
            if (!referenced.has(key)) {
                context.addWarning(`Manifest sound "${key}" is not referenced in SoundMap`);
            }
        }
    }
}
