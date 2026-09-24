import { describe, it, expect } from 'vitest';
import { recordSummary } from '../src/ui/summaries.mjs';
import { makeTranslator } from '../src/ui/i18n.mjs';
import { zh } from '../src/ui/locales/zh.mjs';
import { en } from '../src/ui/locales/en.mjs';

const t = makeTranslator(zh);
const tEn = makeTranslator(en);

const sum = (record) => recordSummary(record, t);

describe('recordSummary — reagent', () => {
  it('should name the percentage and density for a stock conversion', () => {
    // The density is the number people skip, so the summary repeats it back:
    // a stored "12.08 M" with no density is not reproducible.
    const s = sum({
      kind: 'reagent',
      inputs: { mode: 'stock', percent: 37, density: 1.19, formula: 'HCl' },
      outputs: { molarity: 12.0834 },
    });
    expect(s).toContain('37%');
    expect(s).toContain('1.19');
    expect(s).toContain('12.08');
  });

  it('should describe the measured volume and the final volume for a dilution-style conversion', () => {
    const s = sum({
      kind: 'reagent',
      inputs: { mode: 'volume', percent: 37, density: 1.19, formula: 'HCl', targetMolarity: 1, targetVolumeMl: 1000 },
      outputs: { volumeMl: 82.76 },
    });
    expect(s).toContain('82.76');
    expect(s).toContain('1000');
  });

  it('should report normality with the equivalent count that produced it', () => {
    const s = sum({
      kind: 'reagent',
      inputs: { mode: 'normality', formula: 'H2SO4', molarity: 0.5, n: 2 },
      outputs: { normality: 1, equivalentWeight: 49.04 },
    });
    expect(s).toContain('1 N');
    expect(s).toContain('n = 2');
  });

  it('should report molality against the solvent mass', () => {
    const s = sum({
      kind: 'reagent',
      inputs: { mode: 'molality', moles: 1, solventKg: 2 },
      outputs: { molality: 0.5, moleFraction: 0.00893 },
    });
    expect(s).toContain('0.5');
    expect(s).toContain('2');
  });

  it('should count the ions for an ionic-strength record', () => {
    const s = sum({
      kind: 'reagent',
      inputs: { mode: 'ionic', ions: [{ conc: 0.1, charge: 1 }, { conc: 0.1, charge: -1 }] },
      outputs: { ionicStrength: 0.1 },
    });
    expect(s).toContain('0.1');
    expect(s).toContain('2');
  });

  it('should fall back to the stock wording when the mode is missing', () => {
    // Old records written before the mode field existed must still render.
    const s = sum({ kind: 'reagent', inputs: { percent: 98, density: 1.84, formula: 'H2SO4' }, outputs: { molarity: 18.4 } });
    expect(s).toContain('98%');
    expect(s).not.toContain('undefined');
  });
});

describe('recordSummary — spectro', () => {
  it('should show the three inputs and the resulting absorbance', () => {
    const s = sum({
      kind: 'spectro',
      inputs: { mode: 'absorbance', epsilon: 15000, conc: 0.00005, pathCm: 1 },
      outputs: { absorbance: 0.75 },
    });
    expect(s).toContain('15000');
    expect(s).toContain('0.75');
  });

  it('should show the inverted concentration for a reading', () => {
    const s = sum({
      kind: 'spectro',
      inputs: { mode: 'concentration', epsilon: 15000, absorbance: 0.75, pathCm: 1 },
      outputs: { conc: 5e-5, absorbance: 0.75 },
    });
    // 5e-5 is below fmtSci's plain-decimal floor, so it reads as a mantissa
    // and exponent — the same form the result panel uses for this value.
    expect(s).toContain('5×10⁻⁵');
  });

  it('should report the point count and R² for a standard curve', () => {
    const s = sum({
      kind: 'spectro',
      inputs: { mode: 'curve', ptsText: 'x', reading: 0.25 },
      outputs: { fit: { n: 5, r2: 0.99981 }, pred: { value: 0.00049 } },
    });
    expect(s).toContain('5');
    expect(s).toContain('0.9998');
  });
});

describe('recordSummary — lab', () => {
  it('should report both directions of a mole conversion', () => {
    const s = sum({
      kind: 'lab',
      inputs: { mode: 'moles', formula: 'NaCl', massG: 5.844 },
      outputs: { massG: 5.844, moles: 0.1 },
    });
    expect(s).toContain('NaCl');
    expect(s).toContain('5.844');
    expect(s).toContain('0.1');
  });

  it('should not render a trace amount as zero in the history line', () => {
    // The history line had its own toFixed formatter, so a 1 µM preparation
    // recorded "称取 0.00 g NaCl" while the result panel beside it showed
    // 5.844×10⁻⁸ g. Both now go through fmtSci.
    const s = sum({
      kind: 'lab',
      inputs: { mode: 'moles', formula: 'NaCl', massG: 5.844e-8 },
      outputs: { massG: 5.844e-8, moles: 1e-9 },
    });
    expect(s).not.toContain('0.00 g');
    expect(s).toContain('5.844×10⁻⁸');
  });

  it('should show the plate count scaled by the dilution', () => {
    const s = sum({
      kind: 'lab',
      inputs: { mode: 'cfu', colonies: 150, dilutionFactor: 10000, platedVolumeMl: 0.1 },
      outputs: { cfuPerMl: 1.5e7 },
    });
    expect(s).toContain('150');
    expect(s).toContain('10000');
  });

  it('should name the nucleic acid kind in the reader language', () => {
    const record = {
      kind: 'lab',
      inputs: { mode: 'nucleic', lengthBp: 1000, kind: 'dsDNA' },
      outputs: { pmolPerUl: 0.1515, copiesPerUl: 9.12e10 },
    };
    expect(recordSummary(record, t)).toContain('双链');
    expect(recordSummary(record, tEn)).toContain('Double-stranded');
  });

  it('should report the master mix volume and component count', () => {
    const s = sum({
      kind: 'lab',
      inputs: { mode: 'mix', reactions: 24, excessPercent: 10 },
      outputs: { totalVolume: 316.8, rows: [{}, {}, {}, {}] },
    });
    expect(s).toContain('24');
    expect(s).toContain('316.8');
    expect(s).toContain('4');
  });

  it('should never leak a raw key into a lab summary', () => {
    for (const mode of ['moles', 'cfu', 'nucleic', 'mix', 'unknown-mode']) {
      const s = sum({
        kind: 'lab',
        inputs: { mode, formula: 'NaCl', kind: 'dsDNA', solvent: 'water' },
        outputs: { massG: 1, moles: 1, cfuPerMl: 1, pmolPerUl: 1, copiesPerUl: 1, totalVolume: 1, rows: [] },
      });
      expect(s, `mode ${mode} leaked a key`).not.toMatch(/summaries\.|lab\.|colligative\./);
    }
  });
});

describe('recordSummary — colligative', () => {
  it('should report the freezing point and the drop that produced it', () => {
    const s = sum({
      kind: 'colligative',
      inputs: { mode: 'shift', solvent: 'water', molality: 0.5, i: 2 },
      outputs: { deltaTf: 1.86, freezingPoint: -1.86 },
    });
    expect(s).toContain('1.86');
    expect(s).toContain('-1.86');
  });

  it('should name the solvent in the reader language', () => {
    const record = {
      kind: 'colligative',
      inputs: { mode: 'shift', solvent: 'benzene', molality: 0.1 },
      outputs: { deltaTf: 0.512, freezingPoint: 4.988 },
    };
    expect(recordSummary(record, t)).toContain('苯');
    expect(recordSummary(record, tEn)).toContain('Benzene');
  });

  it('should carry the van t Hoff factor into the osmotic summary', () => {
    const s = sum({
      kind: 'colligative',
      inputs: { mode: 'osmotic', molarity: 0.15, i: 2, tempC: 25 },
      outputs: { atm: 7.34 },
    });
    expect(s).toContain('7.34');
    expect(s).toContain('2');
  });

  it('should report the molar mass recovered from a melting point', () => {
    const s = sum({
      kind: 'colligative',
      inputs: { mode: 'unknown', solvent: 'benzene', deltaTf: 1.28 },
      outputs: { molarMass: 200 },
    });
    expect(s).toContain('200');
    expect(s).toContain('1.28');
  });

  it('should never leak a raw key into a colligative summary', () => {
    for (const mode of ['shift', 'osmotic', 'unknown', 'unknown-mode']) {
      const s = sum({
        kind: 'colligative',
        inputs: { mode, solvent: 'water', molality: 1, molarity: 1, i: 1, deltaTf: 1 },
        outputs: { deltaTf: 1, freezingPoint: 1, atm: 1, molarMass: 1 },
      });
      expect(s, `mode ${mode} leaked a key`).not.toMatch(/summaries\.|colligative\./);
    }
  });
});

describe('recordSummary — reaction', () => {
  it('should name the balanced equation', () => {
    const s = sum({
      kind: 'reaction',
      inputs: { mode: 'balance', equation: 'Fe + O2 -> Fe2O3' },
      outputs: { equation: '4Fe + 3O2 -> 2Fe2O3' },
    });
    expect(s).toContain('4Fe + 3O2 -> 2Fe2O3');
  });

  it('should name the limiting reagent and the extent', () => {
    const s = sum({
      kind: 'reaction',
      inputs: { mode: 'limiting', equation: 'H2 + O2 -> H2O' },
      outputs: { limiting: 'O2', extent: 0.5 },
    });
    expect(s).toContain('O2');
    expect(s).toContain('0.5');
  });

  it('should name the empirical formula and count the elements', () => {
    const s = sum({
      kind: 'reaction',
      inputs: { mode: 'formula', entries: [{ element: 'C' }, { element: 'H' }, { element: 'O' }] },
      outputs: { formula: 'CH2O', molarMass: 30.026 },
    });
    expect(s).toContain('CH2O');
    expect(s).toContain('3');
  });

  it('should never leak a raw key', () => {
    for (const mode of ['balance', 'limiting', 'formula', 'unknown-mode']) {
      const s = sum({
        kind: 'reaction',
        inputs: { mode, equation: 'H2 + O2 -> H2O', entries: [] },
        outputs: { equation: 'x', limiting: 'O2', extent: 1, formula: 'H2O', molarMass: 18 },
      });
      expect(s, `mode ${mode} leaked a key`).not.toMatch(/summaries\.|reaction\./);
    }
  });
});

describe('recordSummary — electro', () => {
  it('should name both electrodes for a cell', () => {
    const s = sum({
      kind: 'electro',
      inputs: { mode: 'cell', cathode: 'Cu2+/Cu', anode: 'Zn2+/Zn' },
      outputs: { e: 1.1037 },
    });
    expect(s).toContain('Cu2+/Cu');
    expect(s).toContain('Zn2+/Zn');
  });

  it('should give E° and Q for a bare Nernst calculation', () => {
    const s = sum({
      kind: 'electro',
      inputs: { mode: 'nernst', e0: 1.1, n: 2, q: 0.01 },
      outputs: { e: 1.1592 },
    });
    expect(s).toContain('1.1');
    expect(s).toContain('1.1592');
  });

  it('should never leak a raw key', () => {
    for (const mode of ['nernst', 'cell', 'unknown-mode']) {
      const s = sum({
        kind: 'electro',
        inputs: { mode, e0: 1.1, n: 2, q: 1, cathode: 'Cu2+/Cu', anode: 'Zn2+/Zn' },
        outputs: { e: 1.1 },
      });
      expect(s, `mode ${mode} leaked a key`).not.toMatch(/summaries\.|electro\./);
    }
  });
});

describe('recordSummary — language independence', () => {
  it('should produce a different string in each language for the same record', () => {
    // The whole reason the summary is derived rather than stored: switching
    // language must retranslate entries that were already recorded.
    const record = {
      kind: 'reagent',
      inputs: { mode: 'stock', percent: 37, density: 1.19, formula: 'HCl' },
      outputs: { molarity: 12.0834 },
    };
    expect(recordSummary(record, t)).not.toBe(recordSummary(record, tEn));
  });

  it('should never leak a raw key into a reagent summary', () => {
    for (const mode of ['stock', 'volume', 'normality', 'molality', 'ionic', 'unknown-mode']) {
      const s = sum({ kind: 'reagent', inputs: { mode, ions: [] }, outputs: { molarity: 1, volumeMl: 1, normality: 1, molality: 1, ionicStrength: 1 } });
      expect(s, `mode ${mode} leaked a key`).not.toMatch(/summaries\.|reagent\./);
    }
  });
});
