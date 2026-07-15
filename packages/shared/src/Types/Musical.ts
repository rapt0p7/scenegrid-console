export type GridDivision = '1/4' | '1/8' | '1/16' | '1/32';

export type QuantizeType =
    | 'Immediate'
    | 'NextBeat'
    | 'NextBar'
    | { type: 'NextGridDivision'; division: GridDivision }
    | { type: 'ExactPulse'; pulseOffset: number };
