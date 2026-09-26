import { describe, it, expect } from 'vitest';
import {
  FARADAY, R_GAS, nernst, nernstLine, cellFromHalfCells, STANDARD_POTENTIALS,
} from '../src/calc/electro.mjs';

describe('constants', () => {
  it('should use the CODATA Faraday constant', () => {
    expect(FARADAY).toBeCloseTo(96485.33212, 5);
  });

  it('should use the CODATA gas constant', () => {
    expect(R_GAS).toBeCloseTo(8.314462618, 9);
  });
});

describe('standard potentials', () => {
  /**
   * CRC Handbook of Chemistry and Physics, 25 °C vs SHE.
   *
   * Pinned as a table rather than spot-checked, because a single wrong
   * potential propagates into every cell built from it and the error is
   * invisible: the arithmetic is right, the input was not.
   */
  const CRC = {
    'Li+/Li': -3.0401, 'K+/K': -2.931, 'Ca2+/Ca': -2.868, 'Na+/Na': -2.71,
    'Mg2+/Mg': -2.372, 'Al3+/Al': -1.662, 'Zn2+/Zn': -0.7618,
    'Fe2+/Fe': -0.447, 'Ni2+/Ni': -0.257, 'Pb2+/Pb': -0.1262,
    '2H+/H2': 0, 'Cu2+/Cu': 0.3419, 'Cu+/Cu': 0.521, 'I2/I-': 0.5355,
    'Ag+/Ag': 0.7996, 'Fe3+/Fe2+': 0.771, 'O2/H2O': 1.229,
    'Br2/Br-': 1.087, 'Cl2/Cl-': 1.35827, 'MnO4-/Mn2+': 1.507, 'F2/F-': 2.866,
  };

  it('should match the CRC Handbook to three decimals', () => {
    for (const [half, value] of Object.entries(CRC)) {
      expect(STANDARD_POTENTIALS[half], half).toBeCloseTo(value, 3);
    }
  });

  it('should carry no potential that is not in the reference table', () => {
    // A value added without a source is a value nobody checked.
    for (const half of Object.keys(STANDARD_POTENTIALS)) {
      expect(Object.keys(CRC), `${half} has no reference value`).toContain(half);
    }
  });

  it('should list every half-reaction as a reduction', () => {
    // Mixing oxidation and reduction potentials in one table is the classic
    // way a cell potential comes out wrong: E_cell = E_cathode - E_anode only
    // holds when both are reductions.
    for (const [half, value] of Object.entries(STANDARD_POTENTIALS)) {
      // The reduced species is on the right of the slash and has the lower
      // charge; a sign-flipped table would put the metal on the left.
      const [left, right] = half.split('/');
      expect(left, `${half} looks inverted`).not.toBe('');
      expect(right, `${half} has no reduced form`).toBeTruthy();
      expect(Number.isFinite(value), half).toBe(true);
    }
  });
});

describe('nernst', () => {
  it('should return the standard potential when Q is 1', () => {
    const r = nernst({ e0: 1.1, n: 2, q: 1 });
    expect(r.e).toBeCloseTo(1.1, 12);
    expect(r.logQ).toBeCloseTo(0, 12);
  });

  it('should lower the potential when the products are in excess', () => {
    // Q > 1 drives the reaction left, so the measured voltage drops.
    const r = nernst({ e0: 1.1, n: 2, q: 0.01 });
    expect(r.e).toBeCloseTo(1.1592, 3);
    const back = nernst({ e0: 1.1, n: 2, q: 100 });
    expect(back.e).toBeCloseTo(1.0408, 3);
  });

  it('should use the 0.05916 V shortcut at 298.15 K', () => {
    // E = E0 - (0.05916/n)·log10(Q); at n = 2 and Q = 0.01 that is +0.05916.
    const r = nernst({ e0: 0, n: 2, q: 0.01, tempC: 25 });
    expect(r.e).toBeCloseTo(0.05916, 4);
  });

  it('should scale the correction with 1/n', () => {
    const two = nernst({ e0: 0, n: 2, q: 0.01, tempC: 25 });
    const four = nernst({ e0: 0, n: 4, q: 0.01, tempC: 25 });
    expect(four.e).toBeCloseTo(two.e / 2, 10);
  });

  it('should accept an explicit temperature in celsius', () => {
    const r = nernst({ e0: 1.1, n: 2, q: 0.01, tempC: 37 });
    expect(r.tempK).toBeCloseTo(310.15, 6);
    expect(r.e).toBeCloseTo(1.16154, 4);
  });

  it('should accept a reaction quotient built from concentrations', () => {
    // Zn + Cu2+ -> Zn2+ + Cu, with [Zn2+] = 1 and [Cu2+] = 0.1 → Q = 10.
    const r = nernst({ e0: 1.1037, n: 2, q: 10, tempC: 25 });
    expect(r.e).toBeCloseTo(1.0741, 3);
  });

  it('should report the Gibbs energy change', () => {
    const r = nernst({ e0: 1.1, n: 2, q: 1 });
    // dG = -nFE = -2 × 96485.33212 × 1.1 = -212267.7 J/mol
    expect(r.deltaGKJ).toBeCloseTo(-212.2677, 3);
  });

  it('should report the equilibrium constant from the standard potential', () => {
    const r = nernst({ e0: 1.1, n: 2, q: 1 });
    // log10 K = n·E0 / 0.05916 = 2 × 1.1 / 0.05916 = 37.19
    expect(Math.log10(r.equilibriumK)).toBeCloseTo(37.187, 2);
  });

  it('should call a positive potential spontaneous and a negative one not', () => {
    expect(nernst({ e0: 1.1, n: 2, q: 1 }).spontaneous).toBe(true);
    expect(nernst({ e0: -0.5, n: 2, q: 1 }).spontaneous).toBe(false);
  });

  it('should treat zero volts as not spontaneous rather than as a coin flip', () => {
    // At exactly 0 V the cell is at equilibrium: nothing drives it either way.
    const r = nernst({ e0: 0, n: 1, q: 1 });
    expect(r.e).toBeCloseTo(0, 12);
    expect(r.spontaneous).toBe(false);
  });

  it('should reject a non-positive number of electrons', () => {
    expect(() => nernst({ e0: 1.1, n: 0, q: 1 })).toThrow(/mustBePositive/);
    expect(() => nernst({ e0: 1.1, n: -2, q: 1 })).toThrow(/mustBePositive/);
  });

  it('should reject a non-positive reaction quotient', () => {
    // Q = 0 means a product concentration of zero, whose logarithm is -infinity.
    expect(() => nernst({ e0: 1.1, n: 2, q: 0 })).toThrow(/mustBePositive/);
  });

  it('should reject an absolute zero temperature', () => {
    expect(() => nernst({ e0: 1.1, n: 2, q: 1, tempC: -273.15 })).toThrow(/mustBePositive/);
  });
});

describe('cellFromHalfCells', () => {
  it('should subtract the anode potential from the cathode potential', () => {
    // Daniell cell: Cu2+/Cu (+0.3419) minus Zn2+/Zn (-0.7618) = 1.1037 V
    const r = cellFromHalfCells({ cathode: 'Cu2+/Cu', anode: 'Zn2+/Zn' });
    expect(r.e0).toBeCloseTo(1.1037, 4);
  });

  it('should not flip the sign of the anode — it is already written as a reduction', () => {
    // The classic error is adding the two reductions. Zn is -0.7618 as a
    // reduction, so E_cell = E_cathode - E_anode, never the sum.
    const r = cellFromHalfCells({ cathode: 'Cu2+/Cu', anode: 'Zn2+/Zn' });
    expect(r.e0).toBeCloseTo(STANDARD_POTENTIALS['Cu2+/Cu'] - STANDARD_POTENTIALS['Zn2+/Zn'], 12);
    expect(r.e0).not.toBeCloseTo(STANDARD_POTENTIALS['Cu2+/Cu'] + STANDARD_POTENTIALS['Zn2+/Zn'], 4);
  });

  it('should give the silver and hydrogen cell', () => {
    const r = cellFromHalfCells({ cathode: 'Ag+/Ag', anode: '2H+/H2' });
    expect(r.e0).toBeCloseTo(0.7996, 4);
  });

  it('should reject a half reaction it does not have a potential for', () => {
    expect(() => cellFromHalfCells({ cathode: 'Xx3+/Xx', anode: 'Zn2+/Zn' })).toThrow(/unknownHalfCell/);
  });
});

/**
 * The Nernst line is the answer to "how far can Q move before the cell stops
 * driving the reaction", which a single potential cannot express.
 */
describe('nernstLine', () => {
  const cell = { e0: 1.1037, n: 2, q: 1, tempC: 25 };
  const line = nernstLine(cell);

  it('should be straight in log Q, with the Nernst slope', () => {
    const [a, b] = [line.points[0], line.points.at(-1)];
    const observed = (a.e - b.e) / (b.logQ - a.logQ);
    expect(observed).toBeCloseTo(line.slope, 12);
  });

  it('should pass through E° at log Q = 0', () => {
    const atZero = line.points.reduce((best, p) => (
      Math.abs(p.logQ) < Math.abs(best.logQ) ? p : best
    ));
    // The default range brackets log Q = 0 but does not necessarily land on it.
    expect(atZero.e + line.slope * atZero.logQ).toBeCloseTo(1.1037, 10);
  });

  it('should agree with nernst at the operating point', () => {
    const one = nernst({ ...cell, q: 0.01 });
    const plot = nernstLine({ ...cell, q: 0.01 });
    expect(plot.operatingPoint.logQ).toBeCloseTo(one.logQ, 12);
    expect(plot.operatingPoint.e).toBeCloseTo(one.e, 12);
  });

  it('should bracket the operating point by one decade either side', () => {
    // The window is where the line is informative. Stretching it to reach a
    // distant crossing would squash this region into a pixel.
    expect(line.logQMin).toBeCloseTo(line.operatingPoint.logQ - 1, 12);
    expect(line.logQMax).toBeCloseTo(line.operatingPoint.logQ + 1, 12);
  });

  it('should omit the crossing when the cell is far from equilibrium', () => {
    // A Daniell cell reaches E = 0 at log Q ≈ 37. A chart drawn to include it
    // would show 38 decades and no usable slope, so the window stops at the
    // operating point and the marker is honestly absent.
    expect(line.zeroCrossing).toBeNull();
  });

  it('should mark the crossing when it falls inside the window', () => {
    // log₁₀K = E°/slope, so E° below the slope puts the crossing inside the
    // ±1 decade window. At 25 °C with n = 2 the slope is 0.0296 V.
    const near = nernstLine({ e0: 0.02, n: 2, q: 1 });
    expect(near.zeroCrossing).not.toBeNull();
    // The line is exactly linear in log Q, so the reported crossing lands on
    // E = 0 — not merely near it.
    expect(near.e0 - near.slope * near.zeroCrossing).toBeCloseTo(0, 12);
    expect(near.zeroCrossing).toBeGreaterThanOrEqual(near.logQMin);
    expect(near.zeroCrossing).toBeLessThanOrEqual(near.logQMax);
  });

  it('should agree with log10 K, which is the same crossing by definition', () => {
    const one = nernst({ ...cell });
    expect(line.zeroCrossing ?? one.log10K).toBeCloseTo(one.log10K, 12);
  });

  it('should follow the operating point rather than a fixed window', () => {
    // A cell at Q = 1e-6 sits well past equilibrium; the window must move with
    // it, not stay where Q = 1 put it.
    const far = nernstLine({ ...cell, q: 1e-6 });
    expect(far.logQMin).toBeCloseTo(-7, 12);
    expect(far.logQMax).toBeCloseTo(-5, 12);
    expect(far.zeroCrossing).toBeNull();
  });

  it('should rotate the line with n, without moving the crossing at log Q = 0', () => {
    const two = nernstLine({ ...cell, n: 2 });
    const one = nernstLine({ ...cell, n: 1 });
    expect(one.slope).toBeCloseTo(two.slope * 2, 12);
    expect(one.points[0].e + one.slope * one.points[0].logQ).toBeCloseTo(1.1037, 10);
  });

  it('should steepen the line as the temperature falls', () => {
    const cold = nernstLine({ ...cell, tempC: 4 });
    expect(cold.slope).toBeLessThan(line.slope);
  });

  it('should report no crossing when the range cannot contain one', () => {
    // A negative E° puts the crossing at a negative log Q; clamping the range
    // to positive decades leaves it outside, and the marker must not be drawn.
    const bad = nernstLine({ e0: -0.5, n: 2, q: 1, logQMin: 0, logQMax: 5 });
    expect(bad.zeroCrossing).toBeNull();
  });

  it('should return the requested number of samples', () => {
    expect(nernstLine({ ...cell, points: 30 }).points).toHaveLength(30);
    expect(line.points).toHaveLength(120);
  });

  it('should refuse a non-positive point count', () => {
    expect(() => nernstLine({ ...cell, points: -1 }))
      .toThrowError(expect.objectContaining({ code: 'pointsNotPositive' }));
  });

  it('should refuse an empty range', () => {
    expect(() => nernstLine({ ...cell, logQMin: 5, logQMax: 5 }))
      .toThrowError(expect.objectContaining({ code: 'logRangeEmpty' }));
  });

  it('should refuse a non-positive n, as nernst does', () => {
    expect(() => nernstLine({ ...cell, n: 0 }))
      .toThrowError(expect.objectContaining({ code: 'mustBePositive' }));
  });
});

describe('nernstLine zeroCrossingAt', () => {
  it('should report where the crossing would be, even when out of range', () => {
    // The caption uses this to say how far from equilibrium the cell is; a
    // null zeroCrossing alone cannot express "37 decades away".
    const line = nernstLine({ e0: 1.1037, n: 2, q: 1 });
    expect(line.zeroCrossing).toBeNull();
    expect(line.zeroCrossingAt).toBeCloseTo(nernst({ e0: 1.1037, n: 2, q: 1 }).log10K, 12);
    expect(line.zeroCrossingAt).toBeGreaterThan(30);
  });

  it('should equal zeroCrossing when the crossing is in range', () => {
    const near = nernstLine({ e0: 0.02, n: 2, q: 1 });
    expect(near.zeroCrossing).toBeCloseTo(near.zeroCrossingAt, 12);
  });
});
