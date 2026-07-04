import { IConsistencyReportData } from '@scene-grid/shared';

export interface IConsistencyReporter {
    report(data: IConsistencyReportData): void;
}
