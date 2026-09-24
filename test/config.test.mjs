import { describe, it, expect } from 'vitest';
import { electronConfig } from '../src/calc/config.mjs';
import { ELEMENTS, elementBySymbol } from '../src/calc/elements.mjs';

/** Count the electrons a config string accounts for, core included. */
const CORE_Z = { He: 2, Ne: 10, Ar: 18, Kr: 36, Xe: 54, Rn: 86 };
function electronCount(text) {
  const core = text.match(/^\[(\w+)\]/)?.[1];
  const rest = text.replace(/^\[\w+\]\s*/, '');
  let n = core ? CORE_Z[core] : 0;
  for (const m of rest.matchAll(/(\d)([spdf])(\d+)/g)) n += Number(m[3]);
  return n;
}

describe('electronConfig', () => {
  it('should cover every element from 1 to 118', () => {
    for (const el of ELEMENTS) {
      expect(() => electronConfig(el.number), el.symbol).not.toThrow();
    }
  });

  it('should account for exactly the right number of electrons', () => {
    // The one invariant that catches a typo in any of the twenty hand-written
    // exceptions: the subshell counts must sum to the atomic number.
    for (const el of ELEMENTS) {
      const { full, shorthand } = electronConfig(el.number);
      expect(electronCount(full), `${el.symbol} full`).toBe(el.number);
      expect(electronCount(shorthand), `${el.symbol} shorthand`).toBe(el.number);
    }
  });

  it('should give the textbook configuration for the first twenty elements', () => {
    const known = {
      1: '1s1', 2: '1s2',
      3: '[He] 2s1', 4: '[He] 2s2', 5: '[He] 2s2 2p1', 6: '[He] 2s2 2p2',
      7: '[He] 2s2 2p3', 8: '[He] 2s2 2p4', 9: '[He] 2s2 2p5', 10: '[He] 2s2 2p6',
      11: '[Ne] 3s1', 12: '[Ne] 3s2', 13: '[Ne] 3s2 3p1', 14: '[Ne] 3s2 3p2',
      15: '[Ne] 3s2 3p3', 16: '[Ne] 3s2 3p4', 17: '[Ne] 3s2 3p5', 18: '[Ne] 3s2 3p6',
      19: '[Ar] 4s1', 20: '[Ar] 4s2',
    };
    for (const [z, want] of Object.entries(known)) {
      expect(electronConfig(Number(z)).shorthand, `Z=${z}`).toBe(want);
    }
  });

  it('should get the twenty Madelung exceptions right', () => {
    // These are the reason the module exists. The rule predicts 3d4 4s2 for
    // chromium and 4d8 5s2 for palladium; both are wrong, and a generated
    // table would be wrong in twenty places while looking right everywhere.
    const exceptions = {
      24: '[Ar] 3d5 4s1', // Cr
      29: '[Ar] 3d10 4s1', // Cu
      41: '[Kr] 4d4 5s1', // Nb
      42: '[Kr] 4d5 5s1', // Mo
      44: '[Kr] 4d7 5s1', // Ru
      45: '[Kr] 4d8 5s1', // Rh
      46: '[Kr] 4d10', // Pd
      47: '[Kr] 4d10 5s1', // Ag
      57: '[Xe] 5d1 6s2', // La
      58: '[Xe] 4f1 5d1 6s2', // Ce
      64: '[Xe] 4f7 5d1 6s2', // Gd
      78: '[Xe] 4f14 5d9 6s1', // Pt
      79: '[Xe] 4f14 5d10 6s1', // Au
      89: '[Rn] 6d1 7s2', // Ac
      90: '[Rn] 6d2 7s2', // Th
      91: '[Rn] 5f2 6d1 7s2', // Pa
      92: '[Rn] 5f3 6d1 7s2', // U
      93: '[Rn] 5f4 6d1 7s2', // Np
      96: '[Rn] 5f7 6d1 7s2', // Cm
      103: '[Rn] 5f14 7s2 7p1', // Lr
    };
    for (const [z, want] of Object.entries(exceptions)) {
      const el = ELEMENTS.find((e) => e.number === Number(z));
      expect(electronConfig(Number(z)).shorthand, `${el.symbol} (Z=${z})`).toBe(want);
    }
  });

  it('should not apply the rule to an element that needs an exception', () => {
    // Guards against the exceptions table being defined but never consulted.
    expect(electronConfig(24).shorthand).not.toBe('[Ar] 3d4 4s2');
    expect(electronConfig(46).shorthand).not.toBe('[Kr] 4d8 5s2');
  });

  it('should write subshells in shell order, not filling order', () => {
    // 4s fills before 3d but is written after it: a configuration is read by
    // shell, and filling order is only a bookkeeping device.
    expect(electronConfig(26).full).toBe('1s2 2s2 2p6 3s2 3p6 3d6 4s2');
    expect(electronConfig(26).full.indexOf('3d')).toBeLessThan(electronConfig(26).full.indexOf('4s'));
  });

  it('should count valence electrons outside the noble-gas core', () => {
    expect(electronConfig(11).valence).toBe(1); // Na
    expect(electronConfig(17).valence).toBe(7); // Cl
    expect(electronConfig(2).valence).toBe(2); // He
    expect(electronConfig(18).valence).toBe(8); // Ar
  });

  it('should name the noble-gas core it shortened against', () => {
    expect(electronConfig(26).core).toBe('Ar');
    expect(electronConfig(47).core).toBe('Kr');
    expect(electronConfig(79).core).toBe('Xe');
  });

  it('should report no core for the two elements with nothing below them', () => {
    // Hydrogen and helium have no lower noble gas to shorten against, so they
    // are written in full.
    expect(electronConfig(1).core).toBeNull();
    expect(electronConfig(1).shorthand).toBe('1s1');
    expect(electronConfig(2).core).toBeNull();
    expect(electronConfig(2).shorthand).toBe('1s2');
  });

  it('should return a subshell list that matches the full string', () => {
    for (const el of ELEMENTS) {
      const c = electronConfig(el.number);
      const rebuilt = c.shells.map((s) => `${s.n}${s.l}${s.count}`).join(' ');
      expect(rebuilt, el.symbol).toBe(c.full);
    }
  });

  it('should never exceed a subshell capacity', () => {
    const cap = { s: 2, p: 6, d: 10, f: 14 };
    for (const el of ELEMENTS) {
      for (const s of electronConfig(el.number).shells) {
        expect(s.count, `${el.symbol} ${s.n}${s.l}`).toBeLessThanOrEqual(cap[s.l]);
        expect(s.count, `${el.symbol} ${s.n}${s.l}`).toBeGreaterThan(0);
      }
    }
  });

  it('should throw for an atomic number outside 1-118', () => {
    for (const bad of [0, -1, 119, 1.5, NaN, 'Fe', null, undefined]) {
      expect(() => electronConfig(bad), String(bad)).toThrow(/atomic number/);
    }
  });

  it('should agree with the element table on which elements exist', () => {
    const symbols = new Set(ELEMENTS.map((e) => e.symbol));
    expect(symbols.has('Fe')).toBe(true);
    expect(elementBySymbol('Fe').number).toBe(26);
    expect(electronConfig(elementBySymbol('Fe').number).shorthand).toBe('[Ar] 3d6 4s2');
  });
});
