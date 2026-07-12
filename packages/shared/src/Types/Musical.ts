export type QuantizeType =
    | 'Immediate'
    | 'NextBeat'
    | 'NextBar'
    | { type: 'NextGridDivision'; division: '1/4' | '1/8' | '1/16' | '1/32' }
    | { type: 'ExactPulse'; pulseOffset: number };
