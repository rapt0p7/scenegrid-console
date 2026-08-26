import type { IConsistencyReportData } from '@scene-grid/shared';

import { fc, it as itProp } from '@fast-check/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsoleReporter } from '../ConsoleReporter.js';

describe('ConsoleReporter', () => {
    let groupCollapsedSpy: ReturnType<typeof vi.spyOn>;
    let groupEndSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        groupCollapsedSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
        groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('report', () => {
        it('should log success banner when report is consistent and has no issues', () => {
            const reporter = new ConsoleReporter();
            const data: IConsistencyReportData = {
                errors: [],
                warnings: [],
                isConsistent: true
            };

            reporter.report(data);

            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(logSpy).toHaveBeenCalledWith('%c[AudioSystem] ConsistencyChecker: OK ✓', 'color:green');
            expect(groupCollapsedSpy).not.toHaveBeenCalled();
            expect(errorSpy).not.toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();
        });

        it('should format and log errors inside a styled collapsed console group', () => {
            const reporter = new ConsoleReporter();
            const errors = [
                'Missing required field at "soundMap.sfx_jump.src"',
                'Bus "ambience" not found in bus hierarchy'
            ];
            const data: IConsistencyReportData = {
                errors,
                warnings: [],
                isConsistent: false
            };

            reporter.report(data);

            expect(groupCollapsedSpy).toHaveBeenCalledWith(
                '%c[AudioSystem] ConsistencyChecker: ERRORS',
                'color:red;font-weight:bold'
            );
            expect(errorSpy).toHaveBeenCalledTimes(2);
            expect(errorSpy).toHaveBeenNthCalledWith(1, errors[0]);
            expect(errorSpy).toHaveBeenNthCalledWith(2, errors[1]);
            expect(groupEndSpy).toHaveBeenCalledTimes(1);
            expect(logSpy).not.toHaveBeenCalled();
        });

        it('should format and log warnings inside a styled collapsed console group', () => {
            const reporter = new ConsoleReporter();
            const warnings = ['Event "evt_footstep" references unassigned bus'];
            const data: IConsistencyReportData = {
                errors: [],
                warnings,
                isConsistent: true
            };

            reporter.report(data);

            expect(groupCollapsedSpy).toHaveBeenCalledWith(
                '%c[AudioSystem] ConsistencyChecker: warnings',
                'color:orange'
            );
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy).toHaveBeenCalledWith(warnings[0]);
            expect(groupEndSpy).toHaveBeenCalledTimes(1);
            expect(logSpy).toHaveBeenCalledWith('%c[AudioSystem] ConsistencyChecker: OK ✓', 'color:green');
        });

        it('should output both errors and warnings groups in sequence when both are present', () => {
            const reporter = new ConsoleReporter();
            const data: IConsistencyReportData = {
                errors: ['Fatal: missing manifest entry'],
                warnings: ['Warning: volume exceeds standard threshold'],
                isConsistent: false
            };

            reporter.report(data);

            expect(groupCollapsedSpy).toHaveBeenCalledTimes(2);
            expect(groupEndSpy).toHaveBeenCalledTimes(2);
            expect(errorSpy).toHaveBeenCalledWith('Fatal: missing manifest entry');
            expect(warnSpy).toHaveBeenCalledWith('Warning: volume exceeds standard threshold');
            expect(logSpy).not.toHaveBeenCalled();
        });

        it('should never log the OK banner when isConsistent is false', () => {
            const reporter = new ConsoleReporter();
            const data: IConsistencyReportData = {
                errors: ['Invalid audio format'],
                warnings: [],
                isConsistent: false
            };

            reporter.report(data);

            expect(logSpy).not.toHaveBeenCalled();
        });

        itProp.prop([fc.array(fc.string(), { minLength: 1 })])(
            'should always output every error message and pair every group opening with a groupEnd',
            errors => {
                const reporter = new ConsoleReporter();
                const data: IConsistencyReportData = {
                    errors,
                    warnings: [],
                    isConsistent: false
                };

                reporter.report(data);

                expect(groupCollapsedSpy).toHaveBeenCalledWith(
                    '%c[AudioSystem] ConsistencyChecker: ERRORS',
                    'color:red;font-weight:bold'
                );
                expect(errorSpy).toHaveBeenCalledTimes(errors.length);
                errors.forEach((err, index) => {
                    expect(errorSpy).toHaveBeenNthCalledWith(index + 1, err);
                });
                expect(groupEndSpy).toHaveBeenCalledTimes(1);
            }
        );

        itProp.prop([fc.array(fc.string(), { minLength: 1 })])(
            'should always output every warning message and pair every group opening with a groupEnd',
            warnings => {
                const reporter = new ConsoleReporter();
                const data: IConsistencyReportData = {
                    errors: [],
                    warnings,
                    isConsistent: true
                };

                reporter.report(data);

                expect(groupCollapsedSpy).toHaveBeenCalledWith(
                    '%c[AudioSystem] ConsistencyChecker: warnings',
                    'color:orange'
                );
                expect(warnSpy).toHaveBeenCalledTimes(warnings.length);
                warnings.forEach((warn, index) => {
                    expect(warnSpy).toHaveBeenNthCalledWith(index + 1, warn);
                });
                expect(groupEndSpy).toHaveBeenCalledTimes(1);
            }
        );
    });
});
