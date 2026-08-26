import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { IConsistencyReportData, ITelemetryConsistencyReport } from '@scene-grid/shared';

import { fc, it as itProp } from '@fast-check/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TelemetryConsistencyReporter } from '../TelemetryConsistencyReporter.js';

describe('TelemetryConsistencyReporter', () => {
    let perfNowSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        perfNowSpy = vi.spyOn(performance, 'now');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('report', () => {
        it('should construct and dispatch a valid consistency report telemetry packet', () => {
            const fixedTimestamp = 1250.75;
            perfNowSpy.mockReturnValue(fixedTimestamp);

            const dispatcher = new StubTelemetryDispatcher();
            const reporter = new TelemetryConsistencyReporter(dispatcher);

            const reportData: IConsistencyReportData = {
                errors: ['Missing bus: "Master"'],
                warnings: ['Unreferenced sprite: "sfx_click"'],
                isConsistent: false
            };

            reporter.report(reportData);

            expect(dispatcher.dispatchedPackets).toHaveLength(1);
            expect(dispatcher.dispatchedPackets[0]).toEqual<ITelemetryConsistencyReport>({
                type: 'CONSISTENCY_REPORT',
                timestampMs: fixedTimestamp,
                errors: ['Missing bus: "Master"'],
                warnings: ['Unreferenced sprite: "sfx_click"'],
                isConsistent: false
            });
        });

        it('should capture high-resolution timestamps via performance.now()', () => {
            const timestampA = 100.5;
            const timestampB = 250.2;
            perfNowSpy.mockReturnValueOnce(timestampA).mockReturnValueOnce(timestampB);

            const dispatcher = new StubTelemetryDispatcher();
            const reporter = new TelemetryConsistencyReporter(dispatcher);

            const reportData: IConsistencyReportData = {
                errors: [],
                warnings: [],
                isConsistent: true
            };

            reporter.report(reportData);
            reporter.report(reportData);

            expect(dispatcher.dispatchedPackets).toHaveLength(2);
            expect(dispatcher.dispatchedPackets[0].timestampMs).toBe(timestampA);
            expect(dispatcher.dispatchedPackets[1].timestampMs).toBe(timestampB);
        });

        it('should create defensive copies of errors and warnings so external mutations do not alter dispatched packets', () => {
            perfNowSpy.mockReturnValue(0);
            const dispatcher = new StubTelemetryDispatcher();
            const reporter = new TelemetryConsistencyReporter(dispatcher);

            const mutableErrors = ['Error A'];
            const mutableWarnings = ['Warning A'];

            const reportData: IConsistencyReportData = {
                errors: mutableErrors,
                warnings: mutableWarnings,
                isConsistent: false
            };

            reporter.report(reportData);

            mutableErrors.push('Error B (leaked)');
            mutableWarnings.push('Warning B (leaked)');

            const packet = dispatcher.dispatchedPackets[0];
            expect(packet.errors).toEqual(['Error A']);
            expect(packet.warnings).toEqual(['Warning A']);
        });

        itProp.prop([fc.array(fc.string()), fc.array(fc.string()), fc.boolean(), fc.double({ min: 0, noNaN: true })])(
            'should preserve packet structure and invariants across arbitrary inputs and timestamps',
            (errors, warnings, isConsistent, timestamp) => {
                perfNowSpy.mockReturnValue(timestamp);
                const dispatcher = new StubTelemetryDispatcher();
                const reporter = new TelemetryConsistencyReporter(dispatcher);

                const reportData: IConsistencyReportData = {
                    errors,
                    warnings,
                    isConsistent
                };

                reporter.report(reportData);

                expect(dispatcher.dispatchedPackets).toHaveLength(1);
                const packet = dispatcher.dispatchedPackets[0];

                expect(packet.type).toBe('CONSISTENCY_REPORT');
                expect(packet.timestampMs).toBe(timestamp);
                expect(packet.isConsistent).toBe(isConsistent);
                expect(packet.errors).toEqual(errors);
                expect(packet.warnings).toEqual(warnings);
            }
        );
    });
});

class StubTelemetryDispatcher implements ITelemetryDispatcher {
    public readonly dispatchedPackets: ITelemetryConsistencyReport[] = [];

    public dispatch(packet: ITelemetryConsistencyReport): void {
        this.dispatchedPackets.push(packet);
    }

    public dispatchManifest() {}
}
