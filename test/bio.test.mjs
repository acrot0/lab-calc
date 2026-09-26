import { describe, it, expect } from 'vitest';
import {
  EXTINCTION, nucleicAcidConc, purityRatios, dilutionToTarget, oligoConc,
  seedingVolume, doublingTime, centrifuge, kFactor,
  michaelisMenten, catalyticEfficiency,
} from '../src/calc/bio.mjs';

/**
 * Every expected value here is worked out by hand in the test, from the
 * formula, rather than copied from a run of the code. A test that asserts what
 * the function already returns proves nothing — and these are exactly the
 * calculations where a factor of ten hides for months.
 */

describe('nucleicAcidConc', () => {
  it('should apply the standard dsDNA coefficient', () => {
    // A260 of 1.0 in a 1 cm cuvette is 50 µg/mL of dsDNA by definition.
    expect(nucleicAcidConc(1, 'dsDNA').concNgPerUl).toBe(50);
  });

  it('should apply each coefficient, and they differ by the documented factors', () => {
    // The whole reason the type is a parameter: using 50 on an oligo overstates
    // the yield by 50%.
    expect(nucleicAcidConc(1, 'ssDNA').concNgPerUl).toBe(33);
    expect(nucleicAcidConc(1, 'rna').concNgPerUl).toBe(40);
    expect(nucleicAcidConc(1, 'oligo').concNgPerUl).toBe(33);
    expect(EXTINCTION.dsDNA / EXTINCTION.oligo).toBeCloseTo(1.515, 2);
  });

  it('should scale linearly with absorbance', () => {
    expect(nucleicAcidConc(0.5, 'dsDNA').concNgPerUl).toBe(25);
    expect(nucleicAcidConc(2, 'dsDNA').concNgPerUl).toBe(100);
  });

  it('should correct for a diluted sample', () => {
    // Read at a 1:10 dilution, the neat concentration is ten times the reading.
    expect(nucleicAcidConc(0.5, 'dsDNA', 1, 10).concNgPerUl).toBe(250);
  });

  it('should correct for a path length other than 1 cm', () => {
    // Beer–Lambert: a 0.1 cm path absorbs a tenth as much, so the concentration
    // is ten times the naive reading. This is what a NanoDrop's short path is.
    expect(nucleicAcidConc(0.5, 'dsDNA', 0.1).concNgPerUl).toBe(250);
  });

  it('should report the same number in ng/µL and µg/mL', () => {
    // 1 µg/mL and 1 ng/µL are the same concentration; returning both stops
    // every caller from having to remember that.
    const r = nucleicAcidConc(1.5, 'dsDNA');
    expect(r.concNgPerUl).toBe(r.concUgPerMl);
  });

  it('should accept a zero absorbance as a blank, not an error', () => {
    expect(nucleicAcidConc(0, 'dsDNA').concNgPerUl).toBe(0);
  });

  it('should reject an unknown nucleic acid type', () => {
    expect(() => nucleicAcidConc(1, 'protein')).toThrow();
  });

  it('should reject a negative absorbance', () => {
    expect(() => nucleicAcidConc(-0.1, 'dsDNA')).toThrow();
  });

  it('should reject a zero path length rather than dividing by it', () => {
    expect(() => nucleicAcidConc(1, 'dsDNA', 0)).toThrow();
  });
});

describe('purityRatios', () => {
  it('should compute both ratios', () => {
    const r = purityRatios(1.8, 1.0, 0.9);
    expect(r.ratio260280).toBeCloseTo(1.8, 6);
    expect(r.ratio260230).toBeCloseTo(2.0, 6);
  });

  it('should call a clean DNA prep clean', () => {
    expect(purityRatios(1.8, 1.0, 0.85).verdict).toBe('clean');
  });

  it('should flag protein contamination from a low 260/280', () => {
    expect(purityRatios(1.5, 1.2, 0.8).verdict).toBe('protein');
  });

  it('should flag reagent contamination from a low 260/230', () => {
    // The 260/280 is fine here; only the 230 ratio is wrong, which is the case
    // a single-ratio check would miss entirely.
    expect(purityRatios(1.8, 1.0, 1.5).verdict).toBe('reagent');
  });

  it('should flag a suspiciously high 260/280 as possible RNA carryover', () => {
    expect(purityRatios(2.3, 1.0, 1.0).verdict).toBe('rnaOrLow');
  });

  it('should return null rather than Infinity for a zero denominator', () => {
    // A blank or a failed prep has no ratio. Infinity is a number a table would
    // print; null is the truth.
    const r = purityRatios(0.5, 0, 0);
    expect(r.ratio260280).toBeNull();
    expect(r.ratio260230).toBeNull();
    expect(r.verdict).toBe('unknown');
  });

  it('should accept a missing 230 reading', () => {
    const r = purityRatios(1.8, 1.0, null);
    expect(r.ratio260230).toBeNull();
    expect(r.ratio260280).toBeCloseTo(1.8, 6);
  });
});

describe('dilutionToTarget', () => {
  it('should compute the sample and diluent volumes', () => {
    // 100 µL at 1 mg/mL, wanting 0.1 mg/mL: take 10 µL into 90 µL.
    const r = dilutionToTarget(1, 100, 0.1);
    expect(r.sampleUl).toBeCloseTo(10, 9);
    expect(r.diluentUl).toBeCloseTo(90, 9);
    expect(r.fold).toBeCloseTo(10, 9);
  });

  it('should always split the total between sample and diluent', () => {
    const r = dilutionToTarget(5, 250, 2);
    expect(r.sampleUl + r.diluentUl).toBeCloseTo(r.totalUl, 9);
  });

  it('should reject a target above the stock', () => {
    // Dilution cannot concentrate. Silently returning a volume above the total
    // would be a negative diluent.
    expect(() => dilutionToTarget(1, 100, 2)).toThrow();
  });
});

describe('oligoConc', () => {
  it('should compute the molar mass of a known oligo', () => {
    // A 20-mer of all A: 20 × 313.21 = 6264.2 g/mol.
    expect(oligoConc(1, 'A'.repeat(20)).molarMass).toBeCloseTo(6264.2, 1);
  });

  it('should compute concentration in nmol/µL', () => {
    /*
     * Hand-worked for A20:
     *   ε = 20 × 15400 × 0.9 = 277200 L/(mol·cm)
     *   c = 1 / 277200 = 3.6075e-6 mol/L
     *   3.6075e-6 mol/L × 1e3 = 3.6075e-3 nmol/µL
     */
    const r = oligoConc(1, 'A'.repeat(20));
    expect(r.nmolPerUl).toBeCloseTo(3.6075e-3, 6);
  });

  it('should compute mass concentration in µg/mL', () => {
    // c × M = 3.6075e-6 mol/L × 6264.2 g/mol = 0.022600 g/L = 22.60 µg/mL
    const r = oligoConc(1, 'A'.repeat(20));
    expect(r.ugPerMl).toBeCloseTo(22.6, 2);
  });

  it('should be consistent between the molar and mass results', () => {
    /*
     * The cross-check that catches a wrong power of ten in either conversion.
     *
     * µg/mL ÷ (g/mol) = mmol/L, because µg/mL is g/m³ and g/m³ ÷ g/mol is
     * mol/m³, which is mmol/L. And 1 mmol/L is exactly 1 nmol/µL. So the factor
     * between the two results is 1 — if it were 1e3 or 1e-3, one of the two
     * conversions in the module is wrong.
     */
    const r = oligoConc(0.8, 'ACGTACGTACGT');
    expect(r.ugPerMl / r.molarMass).toBeCloseTo(r.nmolPerUl, 9);
  });

  it('should report GC content', () => {
    expect(oligoConc(1, 'GGCC').gc).toBe(1);
    expect(oligoConc(1, 'ATAT').gc).toBe(0);
    expect(oligoConc(1, 'ACGT').gc).toBe(0.5);
  });

  it('should ignore case and whitespace', () => {
    const a = oligoConc(1, 'acgt acgt');
    const b = oligoConc(1, 'ACGTACGT');
    expect(a.molarMass).toBeCloseTo(b.molarMass, 9);
  });

  it('should treat U as a valid base', () => {
    expect(oligoConc(1, 'AUGC').molarMass).toBeGreaterThan(0);
  });

  it('should reject an empty sequence rather than guessing', () => {
    // The whole point of the sequence-based method is that A260 alone cannot
    // give a molarity. With no sequence there is nothing to compute.
    expect(() => oligoConc(1, '')).toThrow();
    expect(() => oligoConc(1, '!!!')).toThrow();
  });
});

describe('seedingVolume', () => {
  it('should compute the volume to take from the stock', () => {
    // 10 mL at 1e5 cells/mL from a 1e6 stock: 1 mL = 1000 µL.
    const r = seedingVolume(1e6, 1e5, 10);
    expect(r.volumeUl).toBeCloseTo(1000, 6);
    expect(r.dilution).toBeCloseTo(10, 9);
  });

  it('should compute the absolute cell number needed', () => {
    expect(seedingVolume(1e6, 1e5, 10).cellsNeeded).toBeCloseTo(1e6, 3);
  });

  it('should reject seeding denser than the stock', () => {
    expect(() => seedingVolume(1e5, 1e6, 10)).toThrow();
  });
});

describe('doublingTime', () => {
  it('should compute doublings and the doubling time', () => {
    // 1e5 → 4e5 is two doublings; over 48 h that is 24 h per doubling.
    const r = doublingTime(1e5, 4e5, 48);
    expect(r.doublings).toBeCloseTo(2, 9);
    expect(r.doublingTimeH).toBeCloseTo(24, 9);
  });

  it('should give a zero doubling time for no growth', () => {
    // No change is zero doublings, so the division gives Infinity. That is
    // arithmetically honest for "never doubled" — the caller displays it as
    // such, and clamping it to 0 would claim the culture doubled instantly.
    const r = doublingTime(1e5, 1e5, 24);
    expect(r.doublings).toBe(0);
    expect(r.doublingTimeH).toBe(Infinity);
  });

  it('should reject a culture that lost cells', () => {
    // A decline is not a negative doubling time; it is a different phenomenon
    // (death, not division) and a log2 of it would be a negative number that
    // looks like plausible arithmetic.
    expect(() => doublingTime(4e5, 1e5, 24)).toThrow();
  });

  it('should compute the growth rate per hour', () => {
    expect(doublingTime(1e5, 4e5, 48).ratePerH).toBeCloseTo(2 / 48, 9);
  });
});

describe('centrifuge', () => {
  it('should convert RPM to RCF for a known rotor', () => {
    /*
     * RCF = 1.118e-5 × r × rpm².
     * At r = 10 cm and 10000 rpm: 1.118e-5 × 10 × 1e8 = 11180 × g.
     */
    expect(centrifuge(10000, 10, 'rpm').rcf).toBeCloseTo(11180, 0);
  });

  it('should round-trip RCF back to RPM', () => {
    const fwd = centrifuge(10000, 10, 'rpm');
    const back = centrifuge(fwd.rcf, 10, 'rcf');
    expect(back.rpm).toBeCloseTo(10000, 6);
  });

  it('should scale with the square of the speed', () => {
    // Doubling the RPM quadruples the force — the relation is the reason a
    // small speed change is a large force change.
    const a = centrifuge(5000, 10, 'rpm').rcf;
    const b = centrifuge(10000, 10, 'rpm').rcf;
    expect(b / a).toBeCloseTo(4, 6);
  });

  it('should scale linearly with the radius', () => {
    // Which is why RPM alone is not a reproducible protocol.
    const near = centrifuge(10000, 5, 'rpm').rcf;
    const far = centrifuge(10000, 10, 'rpm').rcf;
    expect(far / near).toBeCloseTo(2, 6);
  });

  it('should reject an unknown mode', () => {
    expect(() => centrifuge(1, 10, 'gforce')).toThrow();
  });
});

describe('kFactor', () => {
  it('should compute the clearing constant from the radius', () => {
    // k = 2.53e5 / r
    expect(kFactor(10).k).toBeCloseTo(25300, 6);
  });

  it('should compute the time to pellet at a target RCF', () => {
    // t = k / RCF; 25300 / 10000 = 2.53 minutes.
    expect(kFactor(10, null, null, 10000).timeMin).toBeCloseTo(2.53, 6);
  });

  it('should return a null time when no target is given', () => {
    expect(kFactor(10).timeMin).toBeNull();
  });
});

describe('michaelisMenten', () => {
  it('should recover exact parameters from noiseless data', () => {
    /*
     * Generate points from v = Vmax·s/(Km+s) with Vmax = 10, Km = 2, then check
     * the fit returns them. Data generated from the model is the only way to
     * know the right answer.
     */
    const Vmax = 10;
    const Km = 2;
    const points = [0.5, 1, 2, 5, 10, 20].map((s) => ({ s, v: (Vmax * s) / (Km + s) }));
    const fit = michaelisMenten(points);
    expect(fit.vmax).toBeCloseTo(Vmax, 6);
    expect(fit.km).toBeCloseTo(Km, 6);
    expect(fit.r2).toBeCloseTo(1, 9);
  });

  it('should recover a different pair of parameters', () => {
    // A second parameter set, so the test is not passing by coincidence of one.
    const Vmax = 0.5;
    const Km = 0.05;
    const points = [0.01, 0.05, 0.1, 0.5, 1].map((s) => ({ s, v: (Vmax * s) / (Km + s) }));
    const fit = michaelisMenten(points);
    expect(fit.vmax).toBeCloseTo(Vmax, 6);
    expect(fit.km).toBeCloseTo(Km, 6);
  });

  it('should report a poor fit as a low r2 rather than failing', () => {
    // Scattered data still produces a line; the r2 is what says not to trust it.
    const points = [
      { s: 1, v: 5 }, { s: 2, v: 1 }, { s: 3, v: 9 }, { s: 4, v: 2 }, { s: 5, v: 8 },
    ];
    const fit = michaelisMenten(points);
    expect(fit.r2).toBeLessThan(0.9);
  });

  it('should ignore non-finite and non-positive points', () => {
    // A blank row or a zero-rate measurement carries no information about the
    // fit and would otherwise dominate it.
    const Vmax = 10;
    const Km = 2;
    const good = [0.5, 1, 2, 5, 10, 20].map((s) => ({ s, v: (Vmax * s) / (Km + s) }));
    const fit = michaelisMenten([...good, { s: 0, v: 0 }, { s: 5, v: NaN }]);
    expect(fit.vmax).toBeCloseTo(Vmax, 6);
    expect(fit.points).toBe(6);
  });

  it('should reject too few points', () => {
    expect(() => michaelisMenten([{ s: 1, v: 1 }])).toThrow();
    expect(() => michaelisMenten([])).toThrow();
    expect(() => michaelisMenten(null)).toThrow();
  });

  it('should reject a set with no usable points', () => {
    expect(() => michaelisMenten([{ s: 0, v: 0 }, { s: -1, v: -1 }])).toThrow();
  });

  it('should reject data at a single substrate concentration', () => {
    // Every x is identical, so the slope is undefined — the fit would divide by
    // zero and return Infinity as a Vmax.
    expect(() => michaelisMenten([{ s: 1, v: 1 }, { s: 1, v: 2 }])).toThrow();
  });
});

describe('catalyticEfficiency', () => {
  it('should compute kcat over Km', () => {
    expect(catalyticEfficiency(100, 0.01).efficiency).toBeCloseTo(10000, 6);
  });

  it('should flag an efficiency near the diffusion limit', () => {
    // 10⁹ M⁻¹s⁻¹ is the rate at which two molecules can find each other in
    // water; an enzyme near it is catalytically perfect.
    expect(catalyticEfficiency(1e5, 1e-4).diffusionLimited).toBe(true);
    expect(catalyticEfficiency(10, 1).diffusionLimited).toBe(false);
  });

  it('should reject a non-positive kcat or Km', () => {
    expect(() => catalyticEfficiency(0, 1)).toThrow();
    expect(() => catalyticEfficiency(1, 0)).toThrow();
  });
});
