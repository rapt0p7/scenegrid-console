import type { IConsistencyCheckerOptions } from '@domain/Validation/Ports/IConsistencyCheckerOptions.js';
import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload.js';
import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';

import ValidationContext from '@domain/Validation/Core/ValidationContext.js';
import { ConsoleReporter } from '@domain/Validation/Reporters/ConsoleReporter.js';
import BankSystemRule from '@domain/Validation/Rules/BankSystemRule.js';
import BusesRule from '@domain/Validation/Rules/BusesRule.js';
import EventsRule from '@domain/Validation/Rules/EventsRule.js';
import GhostDuckingRule from '@domain/Validation/Rules/GhostDuckingRule.js';
import MultiplicativeVetoesRule from '@domain/Validation/Rules/MultiplicativeVetoesRule.js';
import MusicFSMRule from '@domain/Validation/Rules/MusicFSMRule.js';
import OrphanManifestRule from '@domain/Validation/Rules/OrphanManifestRule.js';
import RamQuotaRule from '@domain/Validation/Rules/RamQuotaRule.js';
import RoutingCyclesRule from '@domain/Validation/Rules/RoutingCyclesRule.js';
import RTPCManifestRule from '@domain/Validation/Rules/RTPCManifestRule.js';
import SnapshotsRule from '@domain/Validation/Rules/SnapshotsRule.js';
import SoundMapRule from '@domain/Validation/Rules/SoundMapRule.js';
import { isAbsent } from '@scene-grid/shared';

export default class ConsistencyChecker {
    public static validate(
        config: IConsistencyCheckerPayload,
        options: { isReturnWithReport: true } & IConsistencyCheckerOptions
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
            new MusicFSMRule(),
            new RamQuotaRule()
        ];

        for (const rule of rules) {
            rule.validate(context);
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
