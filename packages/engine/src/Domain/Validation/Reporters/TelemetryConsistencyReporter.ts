import type { IConsistencyReporter } from '@domain/Validation/Ports/IConsistencyReporter.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { IConsistencyReportData, ITelemetryConsistencyReport } from '@scene-grid/shared';

export class TelemetryConsistencyReporter implements IConsistencyReporter {
    constructor(private readonly dispatcher: ITelemetryDispatcher) {}

    public report(data: IConsistencyReportData): void {
        const packet: ITelemetryConsistencyReport = {
            type: 'CONSISTENCY_REPORT',
            timestampMs: performance.now(),
            errors: [...data.errors],
            warnings: [...data.warnings],
            isConsistent: data.isConsistent
        };

        this.dispatcher.dispatch(packet);
    }
}
