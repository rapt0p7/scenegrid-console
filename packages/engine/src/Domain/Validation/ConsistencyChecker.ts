import { isAbsent } from '@scene-grid/shared';
import { ConsoleReporter } from '@domain/Validation/Reporters/ConsoleReporter.js';
import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';
import RoutingCyclesRule from '@domain/Validation/Rules/RoutingCyclesRule.js';
import BusesRule from '@domain/Validation/Rules/BusesRule.js';
import SoundMapRule from '@domain/Validation/Rules/SoundMapRule.js';
import SnapshotsRule from '@domain/Validation/Rules/SnapshotsRule.js';
import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload.js';
import type { IConsistencyCheckerOptions } from '@domain/Validation/Ports/IConsistencyCheckerOptions.js';
import ValidationContext from '@domain/Validation/Core/ValidationContext.js';
import GhostDuckingRule from '@domain/Validation/Rules/GhostDuckingRule.js';
import OrphanManifestRule from '@domain/Validation/Rules/OrphanManifestRule.js';
import MultiplicativeVetoesRule from '@domain/Validation/Rules/MultiplicativeVetoesRule.js';
import RTPCManifestRule from '@domain/Validation/Rules/RTPCManifestRule.js';
import BankSystemRule from '@domain/Validation/Rules/BankSystemRule.js';
import EventsRule from '@domain/Validation/Rules/EventsRule.js';
import MusicFSMRule from '@domain/Validation/Rules/MusicFSMRule.js';

export default class ConsistencyChecker {
    public static validate(
        config: IConsistencyCheckerPayload,
        options: { isReturnWithReport: true }
    ): [boolean, { errors: string[]; warnings: string[] }];

    public static validate(config: IConsistencyCheckerPayload, options?: IConsistencyCheckerOptions): boolean;
    public static validate(
        config: IConsistencyCheckerPayload,
        options?: IConsistencyCheckerOptions
    ): boolean | [boolean, { errors: string[]; warnings: string[] }] {
        if (isAbsent(config) || typeof config !== 'object') {
            console.error('[AudioSystem] ConsistencyChecker: config is missing or not an object');
            return false;
        }
        const reporters = options?.reporters ?? [new ConsoleReporter()];
        const context = new ValidationContext(config, { reporters });

        const rules: IValidationRule[] = [
            new RoutingCyclesRule(),
            new BusesRule(),
            new SoundMapRule(),
            new SnapshotsRule(),
            new GhostDuckingRule(),
            new OrphanManifestRule(),
            new MultiplicativeVetoesRule(),
            new RTPCManifestRule(),
            new BankSystemRule(),
            new EventsRule(),
            new MusicFSMRule()
        ];

        try {
            for (const rule of rules) {
                rule.validate(context);
            }
        } catch (error) {
            console.error(error instanceof Error ? error.message : error);
            return false;
        }

        context.report();

        // oxlint-disable-next-line no-unused-vars
        const checker = new ConsistencyChecker(context.getIsConsistent());

        return options?.isReturnWithReport
            ? [context.getIsConsistent(), { errors: context.getErrors(), warnings: context.getWarnings() }]
            : context.getIsConsistent();
    }

    constructor(private readonly isConsistent: boolean) {}
}
