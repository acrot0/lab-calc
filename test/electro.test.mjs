import { describe, it, expect } from 'vitest';
import {
  FARADAY, R_GAS, nernst, cellFromHalfCells, STANDARD_POTENTIALS,
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
