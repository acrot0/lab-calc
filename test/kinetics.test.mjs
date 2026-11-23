import { describe, it, expect } from 'vitest';
import { fitMichaelisMenten, batchInitialRates } from '../src/calc/kinetics.mjs';

describe('kinetics.mjs', () => {
  it('fits noiseless Michaelis-Menten parameters accurately', () => {
    const trueVmax = 0.15;
    const trueKm = 0.25;
    const sVals = [0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2];
    const pts = sVals.map((s) => ({ s, v: (trueVmax * s) / (trueKm + s) }));
    const res = fitMichaelisMenten(pts, { enzymeConcM: 1e-6 });
    expect(res.vmax).toBeCloseTo(trueVmax, 5);
    expect(res.km).toBeCloseTo(trueKm, 5);
    expect(res.r2).toBeCloseTo(1, 6);
    expect(res.kcat).toBeCloseTo(150, 2);
  });

  it('extracts net initial rates with blank subtraction', () => {
    const times = [0, 1, 2, 3, 4];
    const out = batchInitialRates({
      times,
      series: [
        { name: 'blank', role: 'blank', values: [0.01, 0.012, 0.014, 0.016, 0.018] },
        { name: 'sample', role: 'sample', values: [0.02, 0.052, 0.084, 0.116, 0.148] },
      ],
      pathLengthCm: 1,
      extinctionCoeff: 18500,
    });
    expect(out.blankSlope).toBeCloseTo(0.002, 6);
    expect(out.samples[0].netSlope).toBeCloseTo(0.03, 6);
    expect(out.samples[0].r2).toBeCloseTo(1, 6);
    expect(out.samples[0].rateMicromolarPerUnit).toBeCloseTo((0.03 / 18500) * 1e6, 4);
  });
});
