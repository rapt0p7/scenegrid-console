// oxlint-disable max-lines-per-function
// oxlint-disable max-depth
// noinspection D

import { isAbsent, isDefined } from '@shared/guards.js';

import type { IBuses } from '@domain/BusSystem/Ports/IBuses.js';
import type {
    IContainerSoundConfig,
    ILayeredSoundConfig,
    ISmartLoopSoundConfig,
    ISoundConfig,
    AnySoundConfig,
    IBaseSoundConfig,
    ISwitchSoundConfig
} from '@domain/Configuration/Ports/ISoundConfig.js';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';
import type { ISnapshots } from '@domain/Mixer/Ports/ISnapshots.js';
import type { DeepReadonly } from '@shared/DeepReadonly.js';
import { typedEntries, typedKeys } from '@shared/typedObjects.js';
import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { IRTPCManifest } from '@kernel/RTPC/Ports/IRTPCManifest.js';

export interface IConsistencyCheckerPayload {
    readonly soundMap?: ISoundMap;
    readonly manifest?: ISpriteSoundManifest;
    readonly buses?: IBuses;
    readonly snapshots?: ISnapshots;
    readonly rtpcManifest?: IRTPCManifest;
}

type TypeMap = {
    string: string;
    number: number;
    boolean: boolean;
    object: Record<string, unknown>;
    function: Function;
};

export default class ConsistencyChecker {
    public static validate(config: IConsistencyCheckerPayload): boolean {
        if (isAbsent(config) || typeof config !== 'object') {
            console.error('[AudioSystem] ConsistencyChecker: config is missing or not an object');
            return false;
        }

        const checker = new ConsistencyChecker({
            soundMapConfig: config.soundMap ?? {},
            soundManifest: config.manifest ?? {},
            busSystemConfig: config.buses ?? {},
            snapshotsConfig: config.snapshots ?? {},
            rtpcManifest: config.rtpcManifest ?? {}
        });

        try {
            checker.run();
        } catch (error) {
            console.error(error instanceof Error ? error.message : error);
            return false;
        }

        return checker.errors.length === 0;
    }

    private readonly soundMap: DeepReadonly<ISoundMap>;
    private readonly buses: DeepReadonly<IBuses>;
    private readonly snapshots: DeepReadonly<ISnapshots>;
    private readonly manifest: DeepReadonly<ISpriteSoundManifest>;
    private readonly rtpcManifest: DeepReadonly<IRTPCManifest>;

    private readonly errors: string[] = [];
    private readonly warnings: string[] = [];

    constructor({
        soundMapConfig,
        soundManifest,
        busSystemConfig,
        snapshotsConfig,
        rtpcManifest
    }: {
        soundMapConfig: DeepReadonly<ISoundMap>;
        soundManifest: DeepReadonly<ISpriteSoundManifest>;
        busSystemConfig: DeepReadonly<IBuses>;
        snapshotsConfig: DeepReadonly<ISnapshots>;
        rtpcManifest: DeepReadonly<IRTPCManifest>;
    }) {
        this.soundMap = soundMapConfig;
        this.manifest = soundManifest;
        this.buses = busSystemConfig;
        this.snapshots = snapshotsConfig;
        this.rtpcManifest = rtpcManifest;
    }

    private run(): void {
        this.checkRoutingCycles();
        this.checkBuses();
        this.checkSoundMap();
        this.checkSnapshots();
        this.checkGhostDucking();
        this.checkOrphanManifestSounds();
        this.checkMultiplicativeVetoes();
        this.checkRTPCManifest();

        this.report();
    }

    private checkRoutingCycles(): void {
        if (isAbsent(this.buses)) return;

        const visited = new Set<string>();
        const visiting = new Set<string>();
        const path: string[] = [];

        const dfs = (busId: string) => {
            if (visiting.has(busId)) {
                const cycleStartIndex = path.indexOf(busId);
                const cycle = path.slice(cycleStartIndex);
                cycle.push(busId);

                throw new Error(`Fatal Error: Audio routing loop detected in configuration: ${cycle.join(' -> ')}`);
            }

            if (visited.has(busId)) return;

            visiting.add(busId);
            path.push(busId);

            const sends = this.buses[busId]?.sends;
            if (isDefined(sends)) {
                for (const targetBus of typedKeys(sends)) {
                    if (isDefined(this.buses[targetBus])) {
                        dfs(targetBus);
                    }
                }
            }

            path.pop();
            visiting.delete(busId);
            visited.add(busId);
        };

        for (const busId of Object.keys(this.buses)) {
            if (!visited.has(busId)) {
                dfs(busId);
            }
        }
    }

    private assertRequiredType<K extends keyof TypeMap>(
        path: string,
        value: unknown,
        expectedType: K
    ): value is TypeMap[K] {
        if (isAbsent(value)) {
            this.errors.push(`Missing required field at "${path}"`);
            return false;
        }

        if (typeof value !== expectedType) {
            this.errors.push(`Type Error at "${path}": expected ${expectedType}, got ${typeof value}`);
            return false;
        }

        if (expectedType === 'object' && Array.isArray(value)) {
            this.errors.push(`Type Error at "${path}": expected object, got array`);
            return false;
        }

        return true;
    }

    private assertOptionalType<K extends keyof TypeMap>(
        path: string,
        value: unknown,
        expectedType: K
    ): value is TypeMap[K] | undefined {
        if (isAbsent(value)) {
            return true;
        }

        return this.assertRequiredType(path, value, expectedType);
    }

    private assertArray(path: string, value: unknown, isOptional = true): boolean {
        if (isAbsent(value)) {
            if (!isOptional) {
                this.errors.push(`Missing required array at "${path}"`);
                return false;
            }
            return true;
        }

        if (!Array.isArray(value)) {
            this.errors.push(`Type Error at "${path}": expected array, got ${typeof value}`);
            return false;
        }
        return true;
    }

    private checkBuses(): void {
        const validBuses = Object.keys(this.buses || {});

        if (validBuses.length === 0) {
            this.errors.push('No buses defined in config. At least one bus is required.');
            return;
        }

        for (const [busId, busCfg] of typedEntries(this.buses)) {
            if (!this.assertRequiredType(`buses.${busId}`, busCfg, 'object')) continue;

            this.assertOptionalType(`buses.${busId}.gain`, busCfg.gain, 'number');

            if (isDefined(busCfg.filter)) {
                this.assertOptionalType(`buses.${busId}.filter`, busCfg.filter, 'object');
                this.assertRequiredType(`buses.${busId}.filter.type`, busCfg.filter.type, 'string');
            }

            if (isDefined(busCfg.sends)) {
                this.assertOptionalType(`buses.${busId}.sends`, busCfg.sends, 'object');
                for (const [targetBus, gainValue] of typedEntries(busCfg.sends)) {
                    this.assertOptionalType(`buses.${busId}.sends.${targetBus}`, gainValue, 'number');
                    if (!validBuses.includes(targetBus)) {
                        this.errors.push(`Bus "${busId}" sends to unknown bus "${targetBus}"`);
                    }
                    if (busId === targetBus) {
                        this.errors.push(`Bus "${busId}" sends to itself (Feedback Loop!)`);
                    }
                }
            }

            if (isDefined(busCfg.sidechain)) {
                this.assertOptionalType(`buses.${busId}.sidechain`, busCfg.sidechain, 'object');
                if (isDefined(busCfg.sidechain.enabled)) {
                    this.assertOptionalType(`buses.${busId}.sidechain.enabled`, busCfg.sidechain.enabled, 'boolean');
                }
            }

            this.checkRTPC(`buses.${busId}`, busCfg.rtpc);
        }
    }

    private checkSoundMap(): void {
        const validBuses = Object.keys(this.buses || {});

        for (const [soundId, cfg] of typedEntries(this.soundMap || {})) {
            if (!this.assertRequiredType(`soundMap.${soundId}`, cfg, 'object')) continue;

            const baseCfg = cfg as AnySoundConfig;

            if ('busId' in baseCfg && isDefined(baseCfg.busId)) {
                this.assertOptionalType(`soundMap.${soundId}.busId`, baseCfg.busId, 'string');
                if (!validBuses.includes(baseCfg.busId as string)) {
                    this.errors.push(`Sound "${soundId}" references unknown bus "${baseCfg.busId}"`);
                }
            } else if (!('isContainer' in baseCfg) && !('smartLoop' in baseCfg) && !('isLayered' in baseCfg)) {
                this.errors.push(`Sound "${soundId}" has no busId`);
            }

            this.checkRTPC(`soundMap.${soundId}`, (cfg as ISoundConfig).rtpc);
            this.checkDuckingTargets(soundId, cfg);
            this.checkSpatial(soundId, cfg);

            if (this.isLayered(cfg)) {
                this.validateLayeredSound(soundId, cfg);
            } else if (this.isContainer(cfg)) {
                this.validateContainerSound(soundId, cfg);
            } else if (this.isSwitch(cfg)) {
                this.validateSwitchSound(soundId, cfg);
            } else if (this.isSmartLoop(cfg)) {
                this.validateSmartLoop(soundId, cfg);
            }
        }
    }

    private validateLayeredSound(soundId: string, cfg: DeepReadonly<ILayeredSoundConfig>): void {
        if (!this.assertArray(`soundMap.${soundId}.layers`, cfg.layers, false)) return;

        for (const [index, layer] of cfg.layers.entries()) {
            const path = `soundMap.${soundId}.layers[${index}]`;
            if (this.assertRequiredType(path, layer, 'object')) {
                this.assertRequiredType(`${path}.src`, layer.src, 'string');
                this.assertOptionalType(`${path}.delayMs`, layer.delayMs, 'number');
                this.assertOptionalType(`${path}.volume`, layer.volume, 'number');

                if (isDefined(layer.src) && !this.manifest[layer.src] && !this.soundMap[layer.src]) {
                    this.errors.push(`Layered sound "${soundId}" references missing audio "${layer.src}"`);
                }
            }
        }
    }

    private validateContainerSound(soundId: string, cfg: DeepReadonly<IContainerSoundConfig>): void {
        this.assertRequiredType(`soundMap.${soundId}.mode`, cfg.mode, 'string');

        if (!this.assertArray(`soundMap.${soundId}.sources`, cfg.sources, false)) return;

        if (cfg.sources.length === 0) {
            this.errors.push(`Container "${soundId}" has an empty sources array.`);
            return;
        }

        for (const [index, source] of cfg.sources.entries()) {
            if (!isDefined(source)) {
                this.errors.push(`Container "${soundId}" has an undefined source at index ${index}.`);
                continue;
            }

            const targetId = typeof source === 'string' ? source : source.id;

            if (typeof source === 'object') {
                this.assertRequiredType(`soundMap.${soundId}.sources[${index}].id`, targetId, 'string');
                if ('weight' in source && isDefined(source.weight)) {
                    this.assertRequiredType(`soundMap.${soundId}.sources[${index}].weight`, source.weight, 'number');
                }
            } else {
                this.assertRequiredType(`soundMap.${soundId}.sources[${index}]`, targetId, 'string');
            }

            if (isDefined(targetId) && !this.manifest[targetId] && !this.soundMap[targetId]) {
                this.warnings.push(`Container "${soundId}" references missing source "${targetId}".`);
            }
        }
    }

    private validateSmartLoop(soundId: string, cfg: DeepReadonly<ISmartLoopSoundConfig>): void {
        if (!this.assertRequiredType(`soundMap.${soundId}.smartLoop`, cfg.smartLoop, 'object')) return;

        this.assertOptionalType(`soundMap.${soundId}.smartLoop.bpm`, cfg.smartLoop.bpm, 'number');
        this.assertOptionalType(`soundMap.${soundId}.smartLoop.crossfade`, cfg.smartLoop.crossfade, 'number');

        if (!this.assertRequiredType(`soundMap.${soundId}.smartLoop.regions`, cfg.smartLoop.regions, 'object')) return;

        for (const [regionId, range] of typedEntries(cfg.smartLoop.regions)) {
            if (this.assertArray(`soundMap.${soundId}.smartLoop.regions.${regionId}`, range, false)) {
                if (range.length !== 2 || typeof range[0] !== 'number' || typeof range[1] !== 'number') {
                    this.errors.push(`SmartLoop "${soundId}" region "${regionId}" must be an array of two numbers.`);
                } else if (range[0] >= range[1]) {
                    this.errors.push(
                        `SmartLoop "${soundId}" region "${regionId}" has invalid range (${range[0]} >= ${range[1]})`
                    );
                }
            }
        }
    }

    private checkDuckingTargets(soundId: string, cfg: DeepReadonly<IBaseSoundConfig>): void {
        const ducking = cfg.ducking;
        if (isAbsent(ducking)) return;

        if (!this.assertOptionalType(`soundMap.${soundId}.ducking`, ducking, 'object')) return;

        const validBuses = Object.keys(this.buses || {});

        if (isDefined(ducking.target)) {
            const targets = Array.isArray(ducking.target) ? ducking.target : [ducking.target];
            for (const target of targets) {
                if (typeof target !== 'string') {
                    this.errors.push(`Sound "${soundId}" has non-string ducking target`);
                    continue;
                }
                if (validBuses.includes(target)) {
                    const targetBusCfg = this.buses[target];
                    if (isAbsent(targetBusCfg.sidechain) || !targetBusCfg.sidechain.enabled) {
                        this.errors.push(
                            `Sound "${soundId}" targets bus "${target}" for ducking, but sidechain is not enabled on "${target}" bus.`
                        );
                    }
                } else {
                    this.errors.push(`Sound "${soundId}" has invalid ducking target "${target}"`);
                }
            }
        }
    }

    private checkSnapshots(): void {
        const validBuses = Object.keys(this.buses || {});

        for (const [snapshotId, snapshot] of typedEntries(this.snapshots || {})) {
            if (!this.assertRequiredType(`snapshots.${snapshotId}`, snapshot, 'object')) continue;

            if (isAbsent(snapshot.buses)) continue;
            if (!this.assertOptionalType(`snapshots.${snapshotId}.buses`, snapshot.buses, 'object')) continue;

            for (const [busId, busState] of typedEntries(snapshot.buses)) {
                if (!this.assertRequiredType(`snapshots.${snapshotId}.buses.${busId}`, busState, 'object')) continue;

                if (!validBuses.includes(busId)) {
                    this.errors.push(`Snapshot "${snapshotId}" refers to unknown bus "${busId}"`);
                }

                if (isDefined(busState.gain)) {
                    this.assertOptionalType(`snapshots.${snapshotId}.buses.${busId}.gain`, busState.gain, 'number');
                }

                if (isDefined(busState.filter)) {
                    this.assertRequiredType(
                        `snapshots.${snapshotId}.buses.${busId}.filter.type`,
                        busState.filter.type,
                        'string'
                    );
                }

                if (isDefined(busState.sends)) {
                    this.assertOptionalType(`snapshots.${snapshotId}.buses.${busId}.sends`, busState.sends, 'object');
                    for (const [targetBus, sendGain] of typedEntries(busState.sends)) {
                        this.assertOptionalType(
                            `snapshots.${snapshotId}.buses.${busId}.sends.${targetBus}`,
                            sendGain,
                            'number'
                        );
                        if (!validBuses.includes(targetBus)) {
                            this.errors.push(
                                `Snapshot "${snapshotId}" bus "${busId}" sends to unknown bus "${targetBus}"`
                            );
                        }
                    }
                }

                this.checkRTPC(`snapshots.${snapshotId}.buses.${busId}`, busState.rtpc);
            }
        }
    }

    // eslint-disable-next-line complexity
    private checkGhostDucking(): void {
        if (isAbsent(this.snapshots) || isAbsent(this.soundMap) || isAbsent(this.buses)) return;

        const validBuses = Object.keys(this.buses);

        for (const [soundId, soundCfg] of typedEntries(this.soundMap)) {
            if (typeof soundCfg !== 'object' || soundCfg === null) continue;

            const ducking = (soundCfg as IBaseSoundConfig).ducking;
            const parentBusId = (soundCfg as IBaseSoundConfig).busId;

            if (isAbsent(ducking) || isAbsent(parentBusId) || !validBuses.includes(parentBusId)) continue;

            const duckingTargets = Array.isArray(ducking.target) ? ducking.target : [ducking.target];

            for (const [snapshotId, snapshotCfg] of typedEntries(this.snapshots)) {
                if (isAbsent(snapshotCfg.buses)) continue;

                let logicalGain: number;

                const snapshotBus = snapshotCfg.buses[parentBusId];
                if (isDefined(snapshotBus) && isDefined(snapshotBus.gain)) {
                    logicalGain = snapshotBus.gain;
                } else {
                    const defaultBus = this.buses[parentBusId];
                    logicalGain = isDefined(defaultBus?.gain) ? defaultBus.gain : 1;
                }

                if (logicalGain === 0) {
                    this.warnings.push(
                        `Ghost Ducking Risk: Sound "${soundId}" on bus "${parentBusId}" triggers ducking on [${duckingTargets.join(', ')}]. ` +
                            `However, bus "${parentBusId}" has a logical gain of 0 in snapshot "${snapshotId}". ` +
                            `This will cause silent ducking.`
                    );
                }
            }
        }
    }

    // oxlint-disable-next-line max-lines-per-function
    private checkRTPC(
        contextPath: string,
        rtpcMap: DeepReadonly<Partial<Record<RTPCTargetProperty, IRTPCConfig>>> | undefined
    ): void {
        if (isAbsent(rtpcMap)) return;
        if (!this.assertOptionalType(`${contextPath}.rtpc`, rtpcMap, 'object')) return;

        const validBuses = Object.keys(this.buses || {});
        const validCurveTypes = new Set(['linear', 'logarithmic', 'exponential', 's-curve']);
        const validTargets = new Set(['gain', 'filterFrequency', 'pan', 'pitch', 'sendLevel']);

        for (const [targetName, config] of typedEntries(rtpcMap)) {
            if (isAbsent(config)) continue;

            const configPath = `${contextPath}.rtpc.${targetName}`;

            if (!validTargets.has(targetName)) {
                this.errors.push(`${configPath} uses unknown RTPC target "${targetName}".`);
                continue;
            }

            const rConfig = config as IRTPCConfig;

            if (!this.assertRequiredType(`${configPath}.gameParam`, rConfig.gameParam, 'string')) continue;

            if (isDefined(rConfig.smoothingMs)) {
                this.assertOptionalType(`${configPath}.smoothingMs`, rConfig.smoothingMs, 'number');
            }

            const curve = rConfig.curve;
            if (isAbsent(curve)) {
                this.errors.push(`Missing required field at "${configPath}.curve"`);
            } else if (Array.isArray(curve)) {
                if (curve.length < 2) {
                    this.errors.push(`${configPath}.curve has invalid curve (needs >= 2 points).`);
                } else {
                    for (const [index, point] of curve.entries()) {
                        this.assertRequiredType(`${configPath}.curve[${index}].x`, point?.x, 'number');
                        this.assertRequiredType(`${configPath}.curve[${index}].y`, point?.y, 'number');
                    }
                }
            } else if (typeof curve === 'object' && curve !== null && 'type' in curve) {
                const preset = curve;

                if (
                    this.assertRequiredType(`${configPath}.curve.type`, preset.type, 'string') &&
                    !validCurveTypes.has(preset.type)
                ) {
                    this.errors.push(`${configPath}.curve has invalid type "${preset.type}"`);
                }
                this.assertRequiredType(`${configPath}.curve.minX`, preset.minX, 'number');
                this.assertRequiredType(`${configPath}.curve.maxX`, preset.maxX, 'number');
                this.assertRequiredType(`${configPath}.curve.minY`, preset.minY, 'number');
                this.assertRequiredType(`${configPath}.curve.maxY`, preset.maxY, 'number');
            } else {
                this.errors.push(`Type Error at "${configPath}.curve": expected array or valid preset object`);
            }

            if (targetName === 'sendLevel') {
                if (isAbsent(rConfig.sendTargetBus)) {
                    this.errors.push(`${configPath} is missing 'sendTargetBus'.`);
                } else if (!validBuses.includes(rConfig.sendTargetBus as string)) {
                    this.errors.push(`${configPath} references unknown bus "${rConfig.sendTargetBus}".`);
                }
            } else if (isDefined(rConfig.sendTargetBus)) {
                this.errors.push(`${configPath} specifies 'sendTargetBus', but target property is not 'sendLevel'.`);
            }
        }
    }

    private checkSpatial(soundId: string, cfg: DeepReadonly<ISoundConfig>): void {
        const spatial = cfg.spatial;
        if (isAbsent(spatial)) return;

        if (!this.assertOptionalType(`soundMap.${soundId}.spatial`, spatial, 'object')) return;

        if (isDefined(spatial.distanceModel)) {
            const validModels = ['linear', 'inverse', 'exponential'];
            if (!validModels.includes(spatial.distanceModel)) {
                this.errors.push(`Sound "${soundId}" has invalid distanceModel: "${spatial.distanceModel}"`);
            }
        }

        this.assertOptionalType(`soundMap.${soundId}.spatial.refDistance`, spatial.refDistance, 'number');
        this.assertOptionalType(`soundMap.${soundId}.spatial.maxDistance`, spatial.maxDistance, 'number');
        this.assertOptionalType(`soundMap.${soundId}.spatial.rolloffFactor`, spatial.rolloffFactor, 'number');

        if (
            isDefined((spatial as any).position) &&
            this.assertArray(`soundMap.${soundId}.spatial.position`, (spatial as any).position, false)
        ) {
            if ((spatial as any).position.length === 3) {
                (spatial as any).position.forEach((value: any, index: number) => {
                    this.assertRequiredType(`soundMap.${soundId}.spatial.position[${index}]`, value, 'number');
                });
            } else {
                this.errors.push(`Sound "${soundId}" spatial.position must be [x, y, z] (3 numbers)`);
            }
        }
    }

    private isLayered(cfg: AnySoundConfig): cfg is ILayeredSoundConfig {
        return typeof cfg === 'object' && cfg !== null && 'isLayered' in cfg && cfg.isLayered;
    }

    private isContainer(cfg: AnySoundConfig): cfg is IContainerSoundConfig {
        return typeof cfg === 'object' && cfg !== null && 'isContainer' in cfg && cfg.isContainer;
    }

    private isSmartLoop(cfg: AnySoundConfig): cfg is ISmartLoopSoundConfig {
        return typeof cfg === 'object' && cfg !== null && 'smartLoop' in cfg;
    }

    private isSwitch(cfg: any): cfg is ISwitchSoundConfig {
        return cfg && typeof cfg === 'object' && 'isSwitch' in cfg && cfg.isSwitch === true;
    }

    // eslint-disable-next-line complexity
    private checkOrphanManifestSounds(): void {
        const referenced = new Set<string>();

        for (const [key, cfg] of typedEntries(this.soundMap || {})) {
            if (typeof cfg !== 'object' || cfg === null) continue;

            if (this.isLayered(cfg)) {
                const layers = cfg.layers;

                if (Array.isArray(layers)) {
                    for (const layer of layers) {
                        if (isDefined(layer) && isDefined(layer.src)) referenced.add(layer.src);
                    }
                }
            } else if (this.isContainer(cfg)) {
                const sources = cfg.sources;

                if (Array.isArray(sources)) {
                    for (const source of sources) {
                        if (isDefined(source)) {
                            const targetId = typeof source === 'string' ? source : source.id;
                            referenced.add(targetId as string);
                        }
                    }
                }
            } else if (this.isSwitch(cfg)) {
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
            } else if (this.isSmartLoop(cfg)) {
                // Smart loops generally reference their own key
            } else if ('src' in cfg && isDefined(cfg.src)) {
                referenced.add(cfg.src);
            } else if (key in (this.manifest || {})) {
                referenced.add(key);
            }
        }

        for (const key of Object.keys(this.manifest || {})) {
            if (!referenced.has(key)) {
                this.warnings.push(`Manifest sound "${key}" is not referenced in SoundMap`);
            }
        }
    }

    private checkMultiplicativeVetoes(): void {
        const rtpcGainBuses = new Set<string>();

        for (const [busId, busCfg] of typedEntries(this.buses || {})) {
            if (busCfg.rtpc?.gain) {
                rtpcGainBuses.add(busId as string);

                if (busCfg.gain !== undefined && busCfg.gain < 1) {
                    this.warnings.push(
                        `[Orchestration Rule] Bus "${busId}" is RTPC-driven for gain, but its base gain is ${busCfg.gain}. RTPC values will be scaled down. Consider setting base gain to 1.0.`
                    );
                }
            }
        }

        for (const [snapshotId, snapshot] of typedEntries(this.snapshots || {})) {
            if (!snapshot.buses) continue;

            for (const [busId, busState] of typedEntries(snapshot.buses)) {
                if (rtpcGainBuses.has(busId) && busState.gain !== undefined && busState.gain !== 1) {
                    const action = busState.gain === 0 ? 'MUTES' : 'SCALES';
                    this.warnings.push(
                        `[Multiplicative Veto] Snapshot "${snapshotId}" explicitly ${action} gain (${busState.gain}) for bus "${busId}", which is RTPC-driven. This overrides the RTPC curve (Final = ${busState.gain} * RTPC).`
                    );
                }
            }
        }
    }

    private validateSwitchSound(soundId: string, cfg: DeepReadonly<ISwitchSoundConfig>): void {
        this.assertRequiredType(`soundMap.${soundId}.switchGroup`, cfg.switchGroup, 'string');

        if (typeof cfg.switchGroup === 'string' && this.rtpcManifest) {
            if (!(cfg.switchGroup in this.rtpcManifest)) {
                this.errors.push(`Switch "${soundId}" uses unknown switchGroup (RTPC param) "${cfg.switchGroup}".`);
            }
        }

        if (typeof cfg.switches !== 'object' || cfg.switches === null || Array.isArray(cfg.switches)) {
            this.errors.push(`Type Error at "soundMap.${soundId}.switches": expected an object.`);
            return;
        }

        const switchKeys = Object.keys(cfg.switches);

        if (switchKeys.length === 0 && !isDefined(cfg.defaultSwitch)) {
            this.warnings.push(`Switch "${soundId}" has empty switches and no defaultSwitch.`);
        }

        for (const [stateKey, targetId] of Object.entries(cfg.switches)) {
            this.assertRequiredType(`soundMap.${soundId}.switches[${stateKey}]`, targetId, 'string');

            if (isDefined(targetId) && !this.manifest[targetId] && !this.soundMap[targetId]) {
                this.warnings.push(`Switch "${soundId}" references missing source "${targetId}".`);
            }
        }

        if (isDefined(cfg.defaultSwitch)) {
            this.assertRequiredType(`soundMap.${soundId}.defaultSwitch`, cfg.defaultSwitch, 'string');

            if (!this.manifest[cfg.defaultSwitch] && !this.soundMap[cfg.defaultSwitch]) {
                this.warnings.push(`Switch "${soundId}" references missing defaultSwitch "${cfg.defaultSwitch}".`);
            }
        }
    }

    private checkRTPCManifest(): void {
        if (isAbsent(this.rtpcManifest)) return;

        if (!this.assertOptionalType('rtpcManifest', this.rtpcManifest, 'object')) return;

        for (const [gameParamId, config] of typedEntries(this.rtpcManifest)) {
            const configPath = `rtpcManifest.${gameParamId}`;

            if (!this.assertRequiredType(configPath, config, 'object')) continue;

            if (isDefined(config.attackMs)) {
                this.assertOptionalType(`${configPath}.attackMs`, config.attackMs, 'number');
            }

            if (isDefined(config.releaseMs)) {
                this.assertOptionalType(`${configPath}.releaseMs`, config.releaseMs, 'number');
            }

            if (isDefined(config.defaultValue)) {
                this.assertOptionalType(`${configPath}.defaultValue`, config.defaultValue, 'number');
            }
        }
    }

    private report(): void {
        if (this.errors.length > 0) {
            console.groupCollapsed('%c[AudioSystem] ConsistencyChecker: ERRORS', 'color:red;font-weight:bold');
            for (const error of this.errors) console.error(error);
            console.groupEnd();
        }

        if (this.warnings.length > 0) {
            console.groupCollapsed('%c[AudioSystem] ConsistencyChecker: warnings', 'color:orange');
            for (const w of this.warnings) console.warn(w);
            console.groupEnd();
        }

        if (this.errors.length === 0) {
            console.log('%c[AudioSystem] ConsistencyChecker: OK ✓', 'color:green');
        }
    }
}
