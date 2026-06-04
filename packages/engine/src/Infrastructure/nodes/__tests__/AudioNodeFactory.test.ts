// noinspection D
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AudioNodeFactory } from '@infrastructure/nodes/AudioNodeFactory.js';

vi.mock('../../utils/clamp', () => ({
    default: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
}));

describe('AudioNodeFactory', () => {
    let mockContextManager: any;
    let factory: AudioNodeFactory;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContextManager = {
            context: {
                sampleRate: 48_000,
                createGain: vi.fn(() => ({ gain: { value: 0 } })),
                createStereoPanner: vi.fn(() => ({ pan: { value: 0 } })),
                createPanner: vi.fn(() => ({ panningModel: '', setPosition: vi.fn() })),
                createBiquadFilter: vi.fn(() => ({
                    type: '',
                    frequency: { value: 0 },
                    Q: { value: 0 },
                    gain: { value: 0 }
                })),
                createConstantSource: vi.fn(() => ({ start: vi.fn(), offset: { value: 0 } })),
                createDynamicsCompressor: vi.fn(() => ({
                    threshold: { value: 0 },
                    knee: { value: 0 },
                    ratio: { value: 0 },
                    attack: { value: 0 },
                    release: { value: 0 }
                }))
            }
        };

        factory = new AudioNodeFactory(mockContextManager);
    });

    describe('Gain & Stereo Panner', () => {
        it('should create GainNode and clamp values between 0 and 1', () => {
            const defaultGain = factory.createGain();
            expect(defaultGain.gain.value).toBe(1);

            const normalGain = factory.createGain(0.5);
            expect(normalGain.gain.value).toBe(0.5);

            const lowGain = factory.createGain(-5);
            expect(lowGain.gain.value).toBe(0);

            const highGain = factory.createGain(5);
            expect(highGain.gain.value).toBe(1);
        });

        it('should create StereoPanner natively and clamp pan', () => {
            const panner = factory.createStereoPanner(0.5) as any;
            expect(mockContextManager.context.createStereoPanner).toHaveBeenCalled();
            expect(panner.pan.value).toBe(0.5);

            const extremePanner = factory.createStereoPanner(-5) as any;
            expect(extremePanner.pan.value).toBe(-1);
        });

        it('should fallback to classic PannerNode if StereoPanner is not supported', () => {
            delete mockContextManager.context.createStereoPanner;

            const panner = factory.createStereoPanner(0.8) as any;

            expect(mockContextManager.context.createPanner).toHaveBeenCalled();
            expect(panner.panningModel).toBe('equalpower');
            expect(panner.setPosition).toHaveBeenCalledWith(0.8, 0, 1);

            const clampedPanner = factory.createStereoPanner(10) as any;
            expect(clampedPanner.setPosition).toHaveBeenCalledWith(1, 0, 1);
        });
    });

    describe('Biquad Filter (Create & Mutate)', () => {
        it('should create BiquadFilter and delegate configuration to mutateFilter', () => {
            const mutateSpy = vi.spyOn(factory, 'mutateFilter');
            const config = { type: 'lowpass' as const, frequency: 1000 };

            const filter = factory.createFilter(config);

            expect(mockContextManager.context.createBiquadFilter).toHaveBeenCalled();
            expect(mutateSpy).toHaveBeenCalledWith(filter, config);
        });

        it('should mutate existing BiquadFilter and clamp frequency, Q, and gain safely', () => {
            const pooledFilter = {
                type: 'highpass',
                frequency: { value: 0 },
                Q: { value: 0 },
                gain: { value: 0 }
            } as any;

            factory.mutateFilter(pooledFilter, {
                type: 'lowpass',
                frequency: 50_000,
                Q: -10,
                gain: 100
            });

            expect(pooledFilter.type).toBe('lowpass');
            expect(pooledFilter.frequency.value).toBe(24_000);
            expect(pooledFilter.Q.value).toBe(0.0001);
            expect(pooledFilter.gain.value).toBe(40);
        });

        it('should ignore undefined properties during mutateFilter', () => {
            const pooledFilter = {
                type: 'highpass',
                frequency: { value: 1000 },
                Q: { value: 1 },
                gain: { value: 0 }
            } as any;

            factory.mutateFilter(pooledFilter, { type: 'bandpass' });

            expect(pooledFilter.type).toBe('bandpass');
            expect(pooledFilter.frequency.value).toBe(1000);
            expect(pooledFilter.Q.value).toBe(1);
        });
    });

    describe('ConstantSource & Compressor', () => {
        it('should create ConstantSource, call start(), and clamp offset', () => {
            const source = factory.createConstantSource(5) as any;

            expect(mockContextManager.context.createConstantSource).toHaveBeenCalled();
            expect(source.start).toHaveBeenCalled();
            expect(source.offset.value).toBe(1);
        });

        it('should create Compressor with defaults and clamp all parameters', () => {
            const defaultComp = factory.createCompressor();
            expect(defaultComp.threshold.value).toBe(-24);
            expect(defaultComp.knee.value).toBe(30);
            expect(defaultComp.ratio.value).toBe(12);
            expect(defaultComp.attack.value).toBe(0.003);
            expect(defaultComp.release.value).toBe(0.25);

            const extremeComp = factory.createCompressor({
                threshold: 10,
                knee: -10,
                ratio: 50,
                attack: -1,
                release: 5
            });

            expect(extremeComp.threshold.value).toBe(0);
            expect(extremeComp.knee.value).toBe(0);
            expect(extremeComp.ratio.value).toBe(20);
            expect(extremeComp.attack.value).toBe(0);
            expect(extremeComp.release.value).toBe(1);
        });
    });

    describe('3D Panner (Create & Mutate)', () => {
        let pannerMock: any;

        beforeEach(() => {
            pannerMock = {
                panningModel: '',
                distanceModel: '',
                refDistance: 0,
                maxDistance: 0,
                rolloffFactor: 0,
                positionX: { value: 100 },
                positionY: { value: 100 },
                positionZ: { value: 100 }
            };
            mockContextManager.context.createPanner.mockReturnValue(pannerMock);
        });

        it('should create a panner, reset its position, and delegate to mutate3DPanner', () => {
            const mutateSpy = vi.spyOn(factory, 'mutate3DPanner');

            factory.create3DPanner(true);

            expect(mockContextManager.context.createPanner).toHaveBeenCalled();
            expect(mutateSpy).toHaveBeenCalledWith(pannerMock, true);

            expect(pannerMock.positionX.value).toBe(0);
            expect(pannerMock.positionY.value).toBe(0);
            expect(pannerMock.positionZ.value).toBe(0);
        });

        it('should fallback to setPosition if AudioParam position is unavailable during creation', () => {
            const legacyPannerMock = { setPosition: vi.fn() };
            mockContextManager.context.createPanner.mockReturnValue(legacyPannerMock);

            factory.create3DPanner(true);

            expect(legacyPannerMock.setPosition).toHaveBeenCalledWith(0, 0, 0);
        });

        it('should mutate existing panner with default settings when boolean true is passed', () => {
            factory.mutate3DPanner(pannerMock, true);

            expect(pannerMock.panningModel).toBe('HRTF');
            expect(pannerMock.distanceModel).toBe('inverse');
            expect(pannerMock.refDistance).toBe(1);
            expect(pannerMock.maxDistance).toBe(10_000);
            expect(pannerMock.rolloffFactor).toBe(1);
        });

        it('should mutate existing panner and clamp configuration values correctly', () => {
            factory.mutate3DPanner(pannerMock, {
                distanceModel: 'linear',
                refDistance: -50,
                maxDistance: 200_000,
                rolloffFactor: 20
            });

            expect(pannerMock.distanceModel).toBe('linear');
            expect(pannerMock.refDistance).toBe(0.1);
            expect(pannerMock.maxDistance).toBe(100_000);
            expect(pannerMock.rolloffFactor).toBe(10);
        });
    });
});
