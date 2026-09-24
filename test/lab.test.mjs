import { describe, it, expect } from 'vitest';
import {
  AVOGADRO,
  NUCLEOTIDE_MASS,
  COUNTABLE_MIN,
  COUNTABLE_MAX,
  moleConvert,
  cfuPerMl,
  nucleicAcid,
  masterMix,
} from '../src/calc/lab.mjs';

/**
 * Reference values are hand-computed and cross-checked against the published
 * rules of thumb (1 pmol of 1000 bp dsDNA ≈ 0.66 µg; a plate carrying 150
 * colonies at a 10⁻⁴ dilution is 1.5 × 10⁷ CFU/mL).
 */

describe('moleConvert', () => {
  it('should convert mass to moles using the formula molar mass', () => {
    // 5.844 g NaCl ÷ 58.44 g/mol = 0.1 mol
    const r = moleConvert({ formula: 'NaCl', massG: 5.844 });
    expect(r.molarMass).toBeCloseTo(58.44, 2);
    expect(r.moles).toBeCloseTo(0.1, 6);
  });

  it('should count the particles those moles represent', () => {
    const r = moleConvert({ formula: 'NaCl', massG: 5.844 });
    expect(r.particles).toBeCloseTo(0.1 * AVOGADRO, -18);
  });

  it('should convert moles back to mass', () => {
    expect(moleConvert({ formula: 'NaCl', moles: 0.1 }).massG).toBeCloseTo(5.844, 3);
  });

  it('should give the molarity when a volume is supplied', () => {
    // 0.1 mol in 500 mL = 0.2 mol/L
    expect(moleConvert({ formula: 'NaCl', massG: 5.844, volumeMl: 500 }).molarity)
      .toBeCloseTo(0.2, 6);
  });

  it('should omit the molarity when no volume is supplied', () => {
    expect(moleConvert({ formula: 'NaCl', massG: 5.844 }).molarity).toBeUndefined();
  });

  it('should accept an explicit molar mass for things with no formula', () => {
    // A 66 kDa protein: 6.6 mg is 0.1 µmol.
    const r = moleConvert({ molarMassGmol: 66000, massG: 0.0066 });
    expect(r.moles).toBeCloseTo(1e-7, 12);
  });

  it('should reject a call that gives both mass and moles', () => {
    expect(() => moleConvert({ formula: 'NaCl', massG: 1, moles: 1 })).toThrow();
  });

  it('should reject a call that gives neither mass nor moles', () => {
    expect(() => moleConvert({ formula: 'NaCl' })).toThrow();
  });

  it('should reject a call with neither a formula nor a molar mass', () => {
    expect(() => moleConvert({ massG: 1 })).toThrow();
  });

  it('should reject a non-positive molar mass rather than dividing by zero', () => {
    expect(() => moleConvert({ molarMassGmol: 0, massG: 1 })).toThrow();
  });
});

describe('cfuPerMl', () => {
  it('should count colonies back to the undiluted sample', () => {
    // 150 colonies on 0.1 mL of a 10⁻⁴ dilution → 1.5 × 10⁷ CFU/mL
    const r = cfuPerMl({ colonies: 150, dilutionFactor: 1e4, platedVolumeMl: 0.1 });
    expect(r.cfuPerMl).toBeCloseTo(1.5e7, -5);
  });

  it('should treat the dilution factor as the reciprocal people say out loud', () => {
    // "diluted a hundred times" → factor 100, not 0.01. Getting this backwards
    // is an 8-order-of-magnitude error, so it is pinned down by a test.
    const hundred = cfuPerMl({ colonies: 100, dilutionFactor: 100, platedVolumeMl: 1 });
    const hundredth = cfuPerMl({ colonies: 100, dilutionFactor: 0.01, platedVolumeMl: 1 });
    expect(hundred.cfuPerMl).toBeCloseTo(1e4, 6);
    expect(hundredth.cfuPerMl).toBeCloseTo(1, 6);
  });

  it('should accept a plate in the countable range', () => {
    expect(cfuPerMl({ colonies: 150, dilutionFactor: 1e4, platedVolumeMl: 0.1 }).countable).toBe(true);
  });

  it('should flag a plate below the countable range', () => {
    const r = cfuPerMl({ colonies: COUNTABLE_MIN - 1, dilutionFactor: 1e4, platedVolumeMl: 0.1 });
    expect(r.countable).toBe(false);
    expect(r.countWarning?.code).toBe('plateTooFew');
  });

  it('should flag a plate above the countable range', () => {
    const r = cfuPerMl({ colonies: COUNTABLE_MAX + 1, dilutionFactor: 1e4, platedVolumeMl: 0.1 });
    expect(r.countable).toBe(false);
    expect(r.countWarning?.code).toBe('plateTooMany');
  });

  it('should report no warning for a plate inside the range', () => {
    expect(cfuPerMl({ colonies: 150, dilutionFactor: 1e4, platedVolumeMl: 0.1 }).countWarning).toBe(null);
  });

  it('should reject a zero plated volume rather than dividing by zero', () => {
    expect(() => cfuPerMl({ colonies: 150, dilutionFactor: 1e4, platedVolumeMl: 0 })).toThrow();
  });

  it('should reject a zero dilution factor', () => {
    expect(() => cfuPerMl({ colonies: 150, dilutionFactor: 0, platedVolumeMl: 0.1 })).toThrow();
  });
});

describe('nucleicAcid', () => {
  it('should give pmol/µL for a dsDNA sample', () => {
    // 100 ng/µL of 1000 bp dsDNA: 1 pmol = 0.66 µg, so 0.1 µg/µL = 0.1515 pmol/µL
    const r = nucleicAcid({ concNgPerUl: 100, lengthBp: 1000 });
    expect(r.pmolPerUl).toBeCloseTo(0.1515, 4);
  });

  it('should give the copy number per µL', () => {
    // 0.1515 pmol/µL × 6.022e23 / 1e12 = 9.12e10 copies/µL
    const r = nucleicAcid({ concNgPerUl: 100, lengthBp: 1000 });
    expect(r.copiesPerUl).toBeCloseTo(9.12e10, -8);
  });

  it('should use the single-strand residue mass for ssDNA', () => {
    // 100 ng/µL of 1000 nt ssDNA: 100×1000/(1000×330) = 0.3030 pmol/µL
    const r = nucleicAcid({ concNgPerUl: 100, lengthBp: 1000, kind: 'ssDNA' });
    expect(r.pmolPerUl).toBeCloseTo(0.303, 3);
    expect(r.residueMass).toBe(NUCLEOTIDE_MASS.ssDNA);
  });

  it('should use the RNA residue mass for RNA', () => {
    expect(nucleicAcid({ concNgPerUl: 100, lengthBp: 1000, kind: 'RNA' }).residueMass)
      .toBe(NUCLEOTIDE_MASS.RNA);
  });

  it('should scale the total mass by the sample volume', () => {
    // 100 ng/µL in 50 µL = 5000 ng
    const r = nucleicAcid({ concNgPerUl: 100, lengthBp: 1000, volumeUl: 50 });
    expect(r.totalNg).toBeCloseTo(5000, 6);
    expect(r.totalPmol).toBeCloseTo(7.5758, 3);
  });

  it('should solve for the concentration needed to hit a copy number', () => {
    // 1e10 copies/µL of 1000 bp dsDNA → 1e10×1000×660/6.022e14 = 10.96 ng/µL
    const r = nucleicAcid({ copiesPerUl: 1e10, lengthBp: 1000 });
    expect(r.concNgPerUl).toBeCloseTo(10.96, 1);
  });

  it('should round-trip concentration through copy number', () => {
    const forward = nucleicAcid({ concNgPerUl: 100, lengthBp: 1000 });
    const back = nucleicAcid({ copiesPerUl: forward.copiesPerUl, lengthBp: 1000 });
    expect(back.concNgPerUl).toBeCloseTo(100, 6);
  });

  it('should reject a call that gives both concentration and copy number', () => {
    expect(() => nucleicAcid({ concNgPerUl: 100, copiesPerUl: 1e10, lengthBp: 1000 })).toThrow();
  });

  it('should reject a call that gives neither', () => {
    expect(() => nucleicAcid({ lengthBp: 1000 })).toThrow();
  });

  it('should reject an unknown nucleic acid kind', () => {
    expect(() => nucleicAcid({ concNgPerUl: 100, lengthBp: 1000, kind: 'protein' })).toThrow();
  });

  it('should reject a non-positive length', () => {
    expect(() => nucleicAcid({ concNgPerUl: 100, lengthBp: 0 })).toThrow();
  });
});

describe('masterMix', () => {
  const components = [
    { name: 'Buffer', perReaction: 10 },
    { name: 'Primer', perReaction: 1 },
  ];

  it('should scale every component by the reaction count', () => {
    const r = masterMix({ components, reactions: 24 });
    expect(r.totalReactions).toBeCloseTo(24, 6);
    expect(r.rows[0].total).toBeCloseTo(240, 6);
    expect(r.rows[1].total).toBeCloseTo(24, 6);
  });

  it('should add the overage so the last tube is not short', () => {
    // 24 reactions + 10% = 26.4 reactions' worth
    const r = masterMix({ components, reactions: 24, excessPercent: 10 });
    expect(r.totalReactions).toBeCloseTo(26.4, 6);
    expect(r.rows[0].total).toBeCloseTo(264, 6);
  });

  it('should sum the grand total volume', () => {
    expect(masterMix({ components, reactions: 24 }).totalVolume).toBeCloseTo(264, 6);
  });

  it('should default to no overage', () => {
    expect(masterMix({ components, reactions: 10 }).totalReactions).toBeCloseTo(10, 6);
  });

  it('should keep the per-reaction volume on each row', () => {
    expect(masterMix({ components, reactions: 24 }).rows[0].perReaction).toBe(10);
  });

  it('should reject an empty component list', () => {
    expect(() => masterMix({ components: [], reactions: 24 })).toThrow();
  });

  it('should reject a non-positive reaction count', () => {
    expect(() => masterMix({ components, reactions: 0 })).toThrow();
  });

  it('should reject a negative overage', () => {
    expect(() => masterMix({ components, reactions: 24, excessPercent: -5 })).toThrow();
  });
});
