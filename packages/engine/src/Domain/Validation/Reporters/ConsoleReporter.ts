import type { IConsistencyReportData } from '@scene-grid/shared';
import type { IConsistencyReporter } from '@domain/Validation/Ports/IConsistencyReporter.js';

export class ConsoleReporter implements IConsistencyReporter {
    public report(data: IConsistencyReportData): void {
        if (data.errors.length > 0) {
            console.groupCollapsed('%c[AudioSystem] ConsistencyChecker: ERRORS', 'color:red;font-weight:bold');
            for (const error of data.errors) console.error(error);
            console.groupEnd();
        }

        if (data.warnings.length > 0) {
            console.groupCollapsed('%c[AudioSystem] ConsistencyChecker: warnings', 'color:orange');
            for (const w of data.warnings) console.warn(w);
            console.groupEnd();
        }

        if (data.isConsistent) {
            console.log('%c[AudioSystem] ConsistencyChecker: OK ✓', 'color:green');
        }
    }
}
