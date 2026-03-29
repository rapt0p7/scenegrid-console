// noinspection D

import type { IAudioEngineConfig } from '../interfaces/IAudioEngineConfig.js';
import type { IBuses } from '../interfaces/IBuses.js';
import type { ISnapshots } from '../interfaces/ISnapshots.js';
import type {
    IContainerSoundConfig,
    ILayeredSoundConfig,
    ISmartLoopSoundConfig,
    ISoundConfig,
    AnySoundConfig
} from '../interfaces/ISoundConfig.js';
import type { ISoundMap } from '../interfaces/ISoundMap.js';
import type { ISpriteSoundManifest } from '../interfaces/ISpriteSoundManifest.js';

export default class ConsistencyChecker {
    public static validate(config: IAudioEngineConfig): boolean {
        if (!config || typeof config !== 'object') {
            console.error('[AudioSystem] ConsistencyChecker: config is missing or not an object');
            return false;
        }

        const checker = new ConsistencyChecker({
            soundMapConfig: config.soundMap || {},
            soundManifest: config.manifest || {},
            busSystemConfig: config.buses || {},
            snapshotsConfig: config.snapshots || {}
        });

        try {
            checker.run();
        } catch (error) {
            console.error(error instanceof Error ? error.message : error);
            return false;
        }

        return checker.errors.length === 0;
    }

    private readonly soundMap: ISoundMap;
    private readonly buses: IBuses;
    private readonly snapshots: ISnapshots;
    private readonly manifest: ISpriteSoundManifest;

    private readonly errors: string[] = [];
    private readonly warnings: string[] = [];

    constructor({
        soundMapConfig,
        soundManifest,
        busSystemConfig,
        snapshotsConfig
    }: {
        soundMapConfig: ISoundMap;
        soundManifest: ISpriteSoundManifest;
        busSystemConfig: IBuses;
        snapshotsConfig: ISnapshots;
    }) {
        this.soundMap = soundMapConfig;
        this.manifest = soundManifest;
        this.buses = busSystemConfig;
        this.snapshots = snapshotsConfig;
    }

    private run(): void {
        this.checkRoutingCycles();
        this.checkBuses();
        this.checkSoundMap();
        this.checkSnapshots();
        this.checkOrphanManifestSounds();

        this.report();
    }

    private checkRoutingCycles(): void {
        if (!this.buses) return;

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
            if (sends) {
                for (const targetBus of Object.keys(sends)) {
                    if (this.buses[targetBus]) {
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

    // eslint-disable-next-line max-params
    private assertType(
        path: string,
        value: any,
        expectedType: 'string' | 'number' | 'boolean' | 'object' | 'function',
        isOptional = true
    ): boolean {
        if (value === undefined || value === null) {
            if (!isOptional) {
                this.errors.push(`Missing required field at "${path}"`);
                return false;
            }
            return true;
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

    private assertArray(path: string, value: any, isOptional = true): boolean {
        if (value === undefined || value === null) {
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

        for (const [busId, busCfg] of Object.entries(this.buses)) {
            if (!this.assertType(`buses.${busId}`, busCfg, 'object', false)) continue;

            this.assertType(`buses.${busId}.gain`, busCfg.gain, 'number');

            if (busCfg.filter) {
                this.assertType(`buses.${busId}.filter`, busCfg.filter, 'object');
                this.assertType(`buses.${busId}.filter.type`, busCfg.filter.type, 'string', false);
            }

            if (busCfg.sends) {
                this.assertType(`buses.${busId}.sends`, busCfg.sends, 'object');
                for (const [targetBus, gainValue] of Object.entries(busCfg.sends)) {
                    this.assertType(`buses.${busId}.sends.${targetBus}`, gainValue, 'number');
                    if (!validBuses.includes(targetBus)) {
                        this.errors.push(`Bus "${busId}" sends to unknown bus "${targetBus}"`);
                    }
                    if (busId === targetBus) {
                        this.errors.push(`Bus "${busId}" sends to itself (Feedback Loop!)`);
                    }
                }
            }

            if (busCfg.sidechain) {
                this.assertType(`buses.${busId}.sidechain`, busCfg.sidechain, 'object');
                if (busCfg.sidechain.enabled !== undefined) {
                    this.assertType(`buses.${busId}.sidechain.enabled`, busCfg.sidechain.enabled, 'boolean');
                }
            }

            this.checkRTPC(`buses.${busId}`, busCfg.rtpc);
        }
    }

    private checkSoundMap(): void {
        const validBuses = Object.keys(this.buses || {});

        for (const [soundId, cfg] of Object.entries(this.soundMap || {})) {
            if (!this.assertType(`soundMap.${soundId}`, cfg, 'object', false)) continue;

            const baseCfg = cfg as AnySoundConfig;

            if ('busId' in baseCfg && baseCfg.busId) {
                this.assertType(`soundMap.${soundId}.busId`, baseCfg.busId, 'string');
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
            } else if (this.isSmartLoop(cfg)) {
                this.validateSmartLoop(soundId, cfg);
            }
        }
    }

    private validateLayeredSound(soundId: string, cfg: ILayeredSoundConfig): void {
        if (!this.assertArray(`soundMap.${soundId}.layers`, cfg.layers, false)) return;

        for (const [index, layer] of cfg.layers.entries()) {
            const path = `soundMap.${soundId}.layers[${index}]`;
            if (this.assertType(path, layer, 'object', false)) {
                this.assertType(`${path}.src`, layer.src, 'string', false);
                this.assertType(`${path}.delayMs`, layer.delayMs, 'number');
                this.assertType(`${path}.volume`, layer.volume, 'number');

                if (layer.src && !this.manifest[layer.src] && !this.soundMap[layer.src]) {
                    this.errors.push(`Layered sound "${soundId}" references missing audio "${layer.src}"`);
                }
            }
        }
    }

    private validateContainerSound(soundId: string, cfg: IContainerSoundConfig): void {
        this.assertType(`soundMap.${soundId}.mode`, cfg.mode, 'string', false);

        if (!this.assertArray(`soundMap.${soundId}.sources`, cfg.sources, false)) return;

        if (cfg.sources.length === 0) {
            this.errors.push(`Container "${soundId}" has an empty sources array.`);
            return;
        }

        for (const [index, source] of cfg.sources.entries()) {
            this.assertType(`soundMap.${soundId}.sources[${index}]`, source, 'string', false);
            if (source && !this.manifest[source] && !this.soundMap[source]) {
                this.warnings.push(`Container "${soundId}" references missing source "${source}".`);
            }
        }
    }

    private validateSmartLoop(soundId: string, cfg: ISmartLoopSoundConfig): void {
        if (!this.assertType(`soundMap.${soundId}.smartLoop`, cfg.smartLoop, 'object', false)) return;

        this.assertType(`soundMap.${soundId}.smartLoop.bpm`, cfg.smartLoop.bpm, 'number');
        this.assertType(`soundMap.${soundId}.smartLoop.crossfade`, cfg.smartLoop.crossfade, 'number');

        if (!this.assertType(`soundMap.${soundId}.smartLoop.regions`, cfg.smartLoop.regions, 'object', false)) return;

        for (const [regionId, range] of Object.entries(cfg.smartLoop.regions)) {
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

    private checkDuckingTargets(soundId: string, cfg: any): void {
        const ducking = cfg.ducking;
        if (!ducking) return;

        if (!this.assertType(`soundMap.${soundId}.ducking`, ducking, 'object')) return;

        const validBuses = Object.keys(this.buses || {});

        if (ducking.target) {
            const targets = Array.isArray(ducking.target) ? ducking.target : [ducking.target];
            for (const target of targets) {
                if (typeof target !== 'string') {
                    this.errors.push(`Sound "${soundId}" has non-string ducking target`);
                    continue;
                }
                if (validBuses.includes(target)) {
                    const targetBusCfg = this.buses[target] as any;
                    if (!targetBusCfg.sidechain || targetBusCfg.sidechain.enabled !== true) {
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

        for (const [snapshotId, snapshot] of Object.entries(this.snapshots || {})) {
            if (!this.assertType(`snapshots.${snapshotId}`, snapshot, 'object', false)) continue;

            if (!snapshot.buses) continue;
            if (!this.assertType(`snapshots.${snapshotId}.buses`, snapshot.buses, 'object')) continue;

            for (const [busId, busState] of Object.entries(snapshot.buses)) {
                if (!this.assertType(`snapshots.${snapshotId}.buses.${busId}`, busState, 'object', false)) continue;

                if (!validBuses.includes(busId)) {
                    this.errors.push(`Snapshot "${snapshotId}" refers to unknown bus "${busId}"`);
                }

                if (busState.gain !== undefined) {
                    this.assertType(`snapshots.${snapshotId}.buses.${busId}.gain`, busState.gain, 'number');
                }

                if (busState.filter) {
                    this.assertType(
                        `snapshots.${snapshotId}.buses.${busId}.filter.type`,
                        busState.filter.type,
                        'string',
                        false
                    );
                }

                if (busState.sends) {
                    this.assertType(`snapshots.${snapshotId}.buses.${busId}.sends`, busState.sends, 'object');
                    for (const [targetBus, sendGain] of Object.entries(busState.sends)) {
                        this.assertType(
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
    private checkRTPC(contextPath: string, rtpcMap: any): void {
        if (!rtpcMap) return;
        if (!this.assertType(`${contextPath}.rtpc`, rtpcMap, 'object')) return;

        const validBuses = Object.keys(this.buses || {});
        const validCurveTypes = new Set(['linear', 'logarithmic', 'exponential', 's-curve']);

        for (const [targetName, config] of Object.entries(rtpcMap)) {
            if (!config) continue;
            const rConfig = config as any;
            const configPath = `${contextPath}.rtpc.${targetName}`;

            if (!this.assertType(`${configPath}.gameParam`, rConfig.gameParam, 'string', false)) continue;

            if (rConfig.attackMs !== undefined) this.assertType(`${configPath}.attackMs`, rConfig.attackMs, 'number');
            if (rConfig.releaseMs !== undefined)
                this.assertType(`${configPath}.releaseMs`, rConfig.releaseMs, 'number');

            const curve = rConfig.curve;
            if (curve === undefined || curve === null) {
                this.errors.push(`Missing required field at "${configPath}.curve"`);
            } else if (Array.isArray(curve)) {
                if (curve.length < 2) {
                    this.errors.push(`${configPath}.curve has invalid curve (needs >= 2 points).`);
                } else {
                    for (const [index, point] of curve.entries()) {
                        this.assertType(`${configPath}.curve[${index}].x`, point?.x, 'number', false);
                        this.assertType(`${configPath}.curve[${index}].y`, point?.y, 'number', false);
                    }
                }
            } else if (typeof curve === 'object') {
                if (
                    this.assertType(`${configPath}.curve.type`, curve.type, 'string', false) &&
                    !validCurveTypes.has(curve.type)
                ) {
                    this.errors.push(`${configPath}.curve has invalid type "${curve.type}"`);
                }
                this.assertType(`${configPath}.curve.minX`, curve.minX, 'number', false);
                this.assertType(`${configPath}.curve.maxX`, curve.maxX, 'number', false);
                this.assertType(`${configPath}.curve.minY`, curve.minY, 'number', false);
                this.assertType(`${configPath}.curve.maxY`, curve.maxY, 'number', false);
            } else {
                this.errors.push(`Type Error at "${configPath}.curve": expected array or object`);
            }

            if (targetName === 'sendLevel') {
                if (!rConfig.sendTargetBus) {
                    this.errors.push(`${configPath} is missing 'sendTargetBus'.`);
                } else if (!validBuses.includes(rConfig.sendTargetBus)) {
                    this.errors.push(`${configPath} references unknown bus "${rConfig.sendTargetBus}".`);
                }
            }
        }
    }

    private checkSpatial(soundId: string, cfg: any): void {
        const spatial = cfg.spatial;
        if (!spatial) return;

        if (!this.assertType(`soundMap.${soundId}.spatial`, spatial, 'object')) return;

        if (spatial.distanceModel) {
            const validModels = ['linear', 'inverse', 'exponential'];
            if (!validModels.includes(spatial.distanceModel)) {
                this.errors.push(`Sound "${soundId}" has invalid distanceModel: "${spatial.distanceModel}"`);
            }
        }

        this.assertType(`soundMap.${soundId}.spatial.refDistance`, spatial.refDistance, 'number');
        this.assertType(`soundMap.${soundId}.spatial.maxDistance`, spatial.maxDistance, 'number');
        this.assertType(`soundMap.${soundId}.spatial.rolloffFactor`, spatial.rolloffFactor, 'number');

        if (spatial.position && this.assertArray(`soundMap.${soundId}.spatial.position`, spatial.position, false)) {
            if (spatial.position.length === 3) {
                // eslint-disable-next-line unicorn/no-array-for-each
                spatial.position.forEach((value: any, index: number) => {
                    this.assertType(`soundMap.${soundId}.spatial.position[${index}]`, value, 'number', false);
                });
            } else {
                this.errors.push(`Sound "${soundId}" spatial.position must be [x, y, z] (3 numbers)`);
            }
        }
    }

    private isLayered(cfg: any): cfg is ILayeredSoundConfig {
        return cfg?.isLayered === true;
    }

    private isContainer(cfg: any): cfg is IContainerSoundConfig {
        return cfg?.isContainer === true;
    }

    private isSmartLoop(cfg: any): cfg is ISmartLoopSoundConfig {
        return !!cfg?.smartLoop?.regions;
    }

    // eslint-disable-next-line complexity
    private checkOrphanManifestSounds(): void {
        const referenced = new Set<string>();

        for (const [key, cfg] of Object.entries(this.soundMap || {})) {
            if (this.isLayered(cfg)) {
                const layers = (cfg as ILayeredSoundConfig).layers;

                if (Array.isArray(layers)) {
                    for (const layer of layers) {
                        if (layer && layer.src) referenced.add(layer.src);
                    }
                }
            } else if (this.isContainer(cfg)) {
                const sources = (cfg as IContainerSoundConfig).sources;

                if (Array.isArray(sources)) {
                    for (const source of sources) {
                        if (source) referenced.add(source);
                    }
                }
            } else if (this.isSmartLoop(cfg)) {
                // Smart loops generally reference their own key
            } else if ('src' in (cfg as any) && (cfg as any).src) {
                referenced.add((cfg as any).src);
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
