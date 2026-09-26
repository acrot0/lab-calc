import { describe, expect, it } from 'vitest';
import {
  EDTA_FORMATION, conditionalLogK, edtaAlphaY, edtaTitration, gravimetricFactor,
  gravimetricPercent, maskingMargin, recoveryBias, redoxEquivalence, redoxPoint,
  spikeRecovery,
} from '../src/calc/analytical.mjs';

/*
 * The reference values are published constants and hand calculations from the
 * defining equations. The conditional-constant tests in particular would pass
 * on an implementation that ignored pH entirely if they only checked
 * self-consistency — which is the error the module exists to prevent.
 */

describe('edtaAlphaY', () => {
  it('should approach 1 at high pH where EDTA is fully deprotonated', () => {
    // The fourth pKa is 10.24, so by pH 13 essentially all of it is Y4-.
    expect(edtaAlphaY({ pH: 13 })).toBeGreaterThan(0.99);
  });

  it('should be about 0.36 at pH 10, the standard titration condition', () => {
    // The accepted figure for alpha_Y4- at pH 10 is 0.35-0.36, and 0.35 is the
    // value quoted in most texts. Computed here from the four cumulative
    // protonation constants it comes to 0.365.
    expect(edtaAlphaY({ pH: 10 })).toBeCloseTo(0.365, 2);
  });

  it('should collapse to a very small fraction at pH 5', () => {
    // The point of the whole module: at pH 5 the free tetra-anion is roughly
    // one part in three million (3.7e-7), so the conditional constant is 6.4
    // decades smaller and a calcium titration no longer works. An
    // unconditional constant hides this entirely.
    const a = edtaAlphaY({ pH: 5 });
    expect(a).toBeCloseTo(3.7072e-7, 10);
  });

  it('should decrease monotonically as the pH falls', () => {
    const values = [12, 11, 10, 9, 8, 7].map((pH) => edtaAlphaY({ pH }));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });
});

describe('conditionalLogK', () => {
  it('should give the tabulated constant for calcium at pH 10', () => {
    // log K(Ca-EDTA) = 10.69, alpha = 0.365, so log K' = 10.69 - 0.4375 =
    // 10.253. The conditional constant tabulated for pH 10 is 10.2.
    const r = conditionalLogK({ metal: 'Ca', pH: 10 });
    expect(r.logK).toBeCloseTo(10.69, 2);
    expect(r.conditionalLogK).toBeCloseTo(10.25, 1);
    expect(r.sharp).toBe(true);
  });

  it('should make a calcium titration fail at pH 5', () => {
    // log K' falls to about 4.2, well below the threshold for a visible break.
    // This is the difference between "EDTA titrates calcium" and "EDTA
    // titrates calcium at pH 10", which is the fact the module exists to carry.
    const r = conditionalLogK({ metal: 'Ca', pH: 5 });
    expect(r.conditionalLogK).toBeLessThan(8);
    expect(r.sharp).toBe(false);
  });

  it('should keep an iron(III) titration sharp even at pH 5', () => {
    // log K = 25.10 is so large that losing seven orders of magnitude still
    // leaves a usable constant. The same pH that ruins a calcium titration
    // leaves this one intact.
    const r = conditionalLogK({ metal: 'Fe3', pH: 5 });
    expect(r.sharp).toBe(true);
    expect(r.conditionalLogK).toBeGreaterThan(8);
  });

  it('should flag a pH above the range the model covers', () => {
    // Past pH 12 most metals hydrolyse and precipitate, which the tabulated
    // constants have no term for.
    expect(conditionalLogK({ metal: 'Ca', pH: 13 }).valid).toBe(false);
    expect(conditionalLogK({ metal: 'Ca', pH: 10 }).valid).toBe(true);
  });

  it('should refuse a metal that is not tabulated', () => {
    expect(() => conditionalLogK({ metal: 'Xx', pH: 10 })).toThrow();
  });

  it('should carry the tabulated constant for every metal it lists', () => {
    for (const [metal, entry] of Object.entries(EDTA_FORMATION)) {
      expect(conditionalLogK({ metal, pH: 10 }).logK).toBe(entry.logK);
    }
  });
});

describe('edtaTitration', () => {
  it('should compute a 1:1 metal concentration from the titre', () => {
    // 25.00 mL of 0.01000 M EDTA titrating 50.00 mL of sample is
    // 2.500e-4 mol in 0.05000 L = 0.005000 M.
    const r = edtaTitration({
      titrantConc: 0.01, titrantVolumeMl: 25, sampleVolumeMl: 50,
    });
    expect(r.molesMetal).toBeCloseTo(2.5e-4, 10);
    expect(r.sampleConc).toBeCloseTo(0.005, 10);
    expect(r.sampleMm).toBeCloseTo(5, 10);
  });

  it('should give the mass concentration when the metal is named', () => {
    // 0.005 M calcium is 0.005 x 40.078 = 0.20039 g/L.
    const r = edtaTitration({
      titrantConc: 0.01, titrantVolumeMl: 25, sampleVolumeMl: 50, metal: 'Ca',
    });
    expect(r.massConcGPerL).toBeCloseTo(0.005 * 40.078, 6);
  });

  it('should refuse a zero sample volume', () => {
    expect(() => edtaTitration({
      titrantConc: 0.01, titrantVolumeMl: 25, sampleVolumeMl: 0,
    })).toThrow();
  });
});

describe('maskingMargin', () => {
  it('should call a two-decade advantage effective', () => {
    expect(maskingMargin({ maskantLogK: 20, interferentLogK: 18 }).effective).toBe(true);
  });

  it('should flag a partial mask between zero and two decades', () => {
    // The dangerous case: some interferent is hidden and some is titrated, so
    // the result reads low with no visible symptom.
    const r = maskingMargin({ maskantLogK: 19, interferentLogK: 18 });
    expect(r.effective).toBe(false);
    expect(r.partial).toBe(true);
  });

  it('should not flag a mask weaker than the interferent', () => {
    const r = maskingMargin({ maskantLogK: 15, interferentLogK: 18 });
    expect(r.effective).toBe(false);
    expect(r.partial).toBe(false);
  });
});

describe('redoxEquivalence', () => {
  it('should weight the potential by the electron counts', () => {
    // Permanganate-iron: MnO4-/Mn2+ at 1.51 V (5 e-), Fe3+/Fe2+ at 0.771 V
    // (1 e-). E_eq = (5 x 1.51 + 1 x 0.771) / 6 = 1.3867 V.
    const r = redoxEquivalence({
      halfCell1: { potential: 1.51, electrons: 5, label: 'MnO4-/Mn2+' },
      halfCell2: { potential: 0.771, electrons: 1, label: 'Fe3+/Fe2+' },
    });
    expect(r.potential).toBeCloseTo((5 * 1.51 + 0.771) / 6, 10);
    expect(r.potential).toBeCloseTo(1.387, 3);
  });

  it('should differ substantially from the unweighted mean', () => {
    // The naive average is 1.1405 V against a true 1.3867 V — a 246 mV gap,
    // which moves the endpoint through a visible part of the curve.
    const r = redoxEquivalence({
      halfCell1: { potential: 1.51, electrons: 5 },
      halfCell2: { potential: 0.771, electrons: 1 },
    });
    expect(r.naiveMean).toBeCloseTo(1.1405, 4);
    expect(r.potential - r.naiveMean).toBeGreaterThan(0.2);
  });

  it('should reduce to the plain mean when the electron counts match', () => {
    const r = redoxEquivalence({
      halfCell1: { potential: 1.0, electrons: 2 },
      halfCell2: { potential: 0.5, electrons: 2 },
    });
    expect(r.potential).toBeCloseTo(0.75, 10);
    expect(r.potential).toBeCloseTo(r.naiveMean, 10);
  });

  it('should report when the exact formula does not strictly apply', () => {
    // Cr2O7(2-) -> 2 Cr(3+) is asymmetric: one species left, two right.
    const r = redoxEquivalence({
      halfCell1: { potential: 1.33, electrons: 6, symmetric: false },
      halfCell2: { potential: 0.771, electrons: 1, symmetric: true },
    });
    expect(r.symmetric).toBe(false);
  });
});

describe('redoxPoint', () => {
  const cell = { potential: 0.771, electrons: 1 };

  it('should use the analyte couple before the equivalence point', () => {
    // At f = 0.5 the ratio of oxidized to reduced analyte is 1, so the
    // potential is exactly the formal potential.
    const r = redoxPoint({ fraction: 0.5, equivalencePotential: 1.0, halfCell: cell });
    expect(r.region).toBe('analyte');
    expect(r.potential).toBeCloseTo(0.771, 10);
  });

  it('should return the equivalence potential exactly at f = 1', () => {
    const r = redoxPoint({ fraction: 1, equivalencePotential: 1.3867, halfCell: cell });
    expect(r.region).toBe('equivalence');
    expect(r.potential).toBeCloseTo(1.3867, 10);
  });

  it('should switch to the titrant couple past the equivalence point', () => {
    const r = redoxPoint({ fraction: 2, equivalencePotential: 1.0, halfCell: cell });
    expect(r.region).toBe('titrant');
  });

  it('should be 59 mV per decade for a one-electron couple at f = 0.5', () => {
    // At f = 0.5 the log term vanishes; at f = 0.1 it is log10(9) = 0.954, so
    // the shift is 0.05916 x 0.954 = 56.4 mV.
    const half = redoxPoint({ fraction: 0.5, equivalencePotential: 1, halfCell: cell });
    const tenth = redoxPoint({ fraction: 0.1, equivalencePotential: 1, halfCell: cell });
    expect(half.potential - tenth.potential).toBeCloseTo(0.05916 * Math.log10(9), 6);
  });

  it('should halve the slope for a two-electron couple', () => {
    const r = redoxPoint({
      fraction: 0.5, equivalencePotential: 1, halfCell: { potential: 0.5, electrons: 2 },
    });
    expect(r.slope).toBeCloseTo(0.05916 / 2, 10);
  });

  it('should refuse a zero fraction', () => {
    expect(() => redoxPoint({ fraction: 0, equivalencePotential: 1, halfCell: cell })).toThrow();
  });
});

describe('gravimetricFactor', () => {
  it('should give the iron-in-haematite factor', () => {
    // 2 Fe / Fe2O3 = 111.69 / 159.688 = 0.69943. The published factor is 0.6994.
    const r = gravimetricFactor({ sought: 'Fe', weighed: 'Fe2O3', soughtCount: 2 });
    expect(r.factor).toBeCloseTo(0.6994, 4);
    expect(r.ratio).toBe('2 Fe : 1 Fe2O3');
  });

  it('should not silently invert the ratio', () => {
    // The reciprocal is 1.4297 and looks entirely plausible on a report. Both
    // molar masses come back so the direction is checkable.
    const r = gravimetricFactor({ sought: 'Fe', weighed: 'Fe2O3', soughtCount: 2 });
    expect(1 / r.factor).toBeCloseTo(1.4297, 4);
    expect(r.molarMassSought).toBeCloseTo(55.845, 3);
    // 2 x 55.845 + 3 x 15.999 = 159.687 from this project's IUPAC table, not
    // the 159.688 a different table gives. The factor agrees to four places
    // either way, which is the precision the published value carries.
    expect(r.molarMassWeighed).toBeCloseTo(159.687, 3);
  });

  it('should give the barium-in-barium-sulfate factor', () => {
    // Ba / BaSO4 = 137.327 / 233.39 = 0.5884, the textbook figure.
    const r = gravimetricFactor({ sought: 'Ba', weighed: 'BaSO4' });
    expect(r.factor).toBeCloseTo(0.5884, 4);
  });

  it('should handle a weighed form containing more than one sought atom', () => {
    // Ag2S weighed for silver: 2 Ag / Ag2S = 215.74 / 247.80 = 0.8706.
    const r = gravimetricFactor({ sought: 'Ag', weighed: 'Ag2S', soughtCount: 2 });
    expect(r.factor).toBeCloseTo(0.8706, 4);
  });
});

describe('gravimetricPercent', () => {
  it('should compute percent analyte from the precipitate mass', () => {
    // 0.5000 g sample giving 0.2500 g Fe2O3 at F = 0.6994 is 0.174850 g Fe,
    // or 34.97%.
    const F = gravimetricFactor({ sought: 'Fe', weighed: 'Fe2O3', soughtCount: 2 }).factor;
    const r = gravimetricPercent({
      sampleMassG: 0.5, precipitateMassG: 0.25, factor: F,
    });
    expect(r.analyteMassG).toBeCloseTo(0.25 * F, 10);
    expect(r.percent).toBeCloseTo(34.97, 1);
  });

  it('should refuse a zero sample mass', () => {
    expect(() => gravimetricPercent({
      sampleMassG: 0, precipitateMassG: 0.25, factor: 0.7,
    })).toThrow();
  });
});

describe('spikeRecovery', () => {
  it('should compute recovery from the difference the spike made', () => {
    // Unspiked 10.0, spiked 15.0, added 5.0: found 5.0, recovery 100%.
    const r = spikeRecovery({ unspiked: 10, spiked: 15, added: 5 });
    expect(r.found).toBeCloseTo(5, 10);
    expect(r.recovery).toBeCloseTo(100, 10);
    expect(r.direction).toBe('exact');
  });

  it('should call 95% acceptable but low', () => {
    const r = spikeRecovery({ unspiked: 10, spiked: 14.75, added: 5 });
    expect(r.recovery).toBeCloseTo(95, 10);
    expect(r.acceptable).toBe(true);
    expect(r.direction).toBe('low');
  });

  it('should call 70% unacceptable', () => {
    const r = spikeRecovery({ unspiked: 10, spiked: 13.5, added: 5 });
    expect(r.recovery).toBeCloseTo(70, 10);
    expect(r.acceptable).toBe(false);
  });

  it('should refuse a zero spike', () => {
    expect(() => spikeRecovery({ unspiked: 10, spiked: 15, added: 0 })).toThrow();
  });
});

describe('recoveryBias', () => {
  it('should find no bias in a recovery that is scatter around 100', () => {
    // Mean 98, sd 4.47, sem 2.0 — t = -1.0 against a critical of 2.78 at
    // n = 5. A 2% shortfall that is inside the noise is not evidence of bias.
    const r = recoveryBias({ recoveries: [95, 96, 98, 100, 101] });
    expect(r.mean).toBeCloseTo(98, 10);
    expect(r.significant).toBe(false);
    expect(r.biased).toBe(false);
  });

  it('should find a bias in a tight recovery that is consistently low', () => {
    // Mean 90 with tiny scatter: the offset is far larger than the noise.
    const r = recoveryBias({ recoveries: [89.8, 90.0, 90.1, 89.9, 90.2] });
    expect(r.significant).toBe(true);
    expect(r.biased).toBe(true);
    expect(r.percentBias).toBeCloseTo(-10, 1);
  });

  it('should use the t quantile, not 1.96, at small n', () => {
    // Three replicates give t(0.025, 2) = 4.303, more than twice 1.96. A
    // borderline result flips depending on which is used, and 1.96 would call
    // a bias that the correct test cannot support.
    const r = recoveryBias({ recoveries: [94, 100, 106] });
    expect(r.critical).toBeCloseTo(4.303, 2);
    expect(r.significant).toBe(false);
  });

  it('should report a definite bias when every replicate is identical and off', () => {
    const r = recoveryBias({ recoveries: [90, 90, 90] });
    expect(r.biased).toBe(true);
  });

  it('should report no bias when every replicate is exactly 100', () => {
    const r = recoveryBias({ recoveries: [100, 100, 100] });
    expect(r.biased).toBe(false);
  });

  it('should refuse fewer than two replicates', () => {
    expect(() => recoveryBias({ recoveries: [95] })).toThrow();
  });
});
