import { ConsistencyChecker } from '@scene-grid/engine';

export async function validateConfigurations(payload: any): Promise<{ errors: string[]; warnings: string[] }> {
    // oxlint-disable-next-line no-unused-vars
    const [isValid, report] = ConsistencyChecker.validate(payload, { isReturnWithReport: true });

    return {
        errors: report.errors || [],
        warnings: report.warnings || []
    };
}
