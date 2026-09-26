import { describe, expect, it } from 'vitest';
import {
  BUFFER_PRESETS, PKA_ENTHALPY, PKA_REFERENCE_C, correctedBuffer, gammaFor,
  bufferPreset, hendersonHasselbalchActivity, ionicStrengthOf, pKaAt, weakAcidPhActivity,
} from '../src/calc/activity.mjs';
import { hendersonHasselbalch, bufferRecipe } from '../src/calc/buffer.mjs';
import { weakAcidPh } from '../src/calc/titration.mjs';

/** The gas constant in kJ/(mol·K). Duplicated on purpose: see the test below. */
const R_KJ = 0.008314;

/*
 * Every known answer here is either a published figure or a hand calculation
 * from the defining equation. The point of the module is that it produces
 * *different* numbers from the ideal model, so a test that only checked
 * self-consistency would pass on a module that returned the ideal answer with
 * extra steps.
 */

describe('pKaAt', () => {
  it('should return the tabulated pKa at the reference temperature', () => {
    expect(pKaAt({ pKa25: 4.76, deltaH: -0.41, tempC: 25 })).toBeCloseTo(4.76, 10);
  });

  it('should move a Tris buffer the right way over a 25 to 4 degree shift', () => {
    /*
     * Tris: pKa 8.06 at 25 °C, ΔH = −47.7 kJ/mol, published dpKa/dT −0.028/°C.
     *
     * The integrated van 't Hoff form is exact over the interval and gives
     * 8.693 at 4 °C — 0.045 further than the linear 0.028/°C estimate, because
     * dpKa/dT itself grows as T falls. Both agree that the pKa RISES when the
     * buffer is chilled; a sign error would put this at 7.43, which is more
     * than a unit wrong and would make a cold-room Tris buffer read as low
     * when it reads high.
     */
    const p = pKaAt({ pKa25: 8.06, deltaH: -47.7, tempC: 4 });
    expect(p).toBeGreaterThan(8.06);
    expect(p).toBeCloseTo(8.693, 3);
    // And the linear estimate is a lower bound, not the answer.
    expect(p).toBeGreaterThan(8.06 + 21 * 0.028);
  });

  it('should move acetic acid down as it warms, and by very little', () => {
    // ΔH = −0.41 kJ/mol gives dpKa/dT = −0.0002/°C, so 25 → 37 is −0.0024.
    const p = pKaAt({ pKa25: 4.76, deltaH: -0.41, tempC: 37 });
    expect(p).toBeLessThan(4.76);
    expect(Math.abs(p - 4.76)).toBeLessThan(0.01);
  });

  it('should reproduce the published dpKa/dT for Tris', () => {
    // The test above checks one point; this checks the slope the point comes
    // from, so a coefficient error that happens to fit 4 °C cannot pass.
    // −47.7 / (2.303 · R · T²) at 298.15 K is −0.0280.
    const d = pKaAt({ pKa25: 8.06, deltaH: -47.7, tempC: 26 }) - 8.06;
    expect(d).toBeCloseTo(-0.0280, 3);
  });

  it('should refuse a temperature below absolute zero', () => {
    expect(() => pKaAt({ pKa25: 4.76, deltaH: -0.41, tempC: -300 })).toThrow();
  });

  it('should reject a non-finite temperature', () => {
    expect(() => pKaAt({ pKa25: 4.76, deltaH: -0.41, tempC: NaN })).toThrow();
  });
});

describe('PKA_ENTHALPY', () => {
  /*
   * The published `dpKa/dT` for each buffer, per °C. These are the numbers a
   * bench worker looks up, and they are what the table's ΔH values have to
   * reproduce — a ΔH entered with the wrong sign gives a slope of the right
   * magnitude and the wrong direction, which no internal consistency check
   * would catch.
   *
   * Source: the standard buffer tables (Good et al. for the Good's buffers,
   * Christensen et al. for the calorimetric enthalpies).
   */
  const PUBLISHED = {
    acetate: 0.0002,
    carbonate: 0.0053,
    phosphate: 0.0047,
    // The second pKa of phosphate — the pair buffers are actually made from.
    phosphate2: 0.0047,
    tris: 0.0280,
    ammonia: 0.0307,
    pyridine: 0.0165,
    hepes: 0.0123,
    mes: 0.0082,
    citrate: 0.0029,
    borate: 0.0076,
  };

  it('should carry an entry for every buffer it names', () => {
    expect(Object.keys(PKA_ENTHALPY).sort()).toEqual(Object.keys(PUBLISHED).sort());
  });

  it('should reproduce every published dpKa/dT', () => {
    for (const [name, expected] of Object.entries(PUBLISHED)) {
      const { pKa25, deltaH } = PKA_ENTHALPY[name];
      // dpKa/dT = −ΔH / (2.303·R·T²) at the reference temperature.
      const slope = -deltaH / (Math.LN10 * R_KJ * (PKA_REFERENCE_C + 273.15) ** 2);
      expect(slope, name).toBeCloseTo(expected, 4);
    }
  });

  it('should give every buffer a pKa that is unchanged at the reference temperature', () => {
    for (const [name, { pKa25, deltaH }] of Object.entries(PKA_ENTHALPY)) {
      expect(pKaAt({ pKa25, deltaH, tempC: PKA_REFERENCE_C }), name).toBeCloseTo(pKa25, 10);
    }
  });

  it('should move Tris far more than any of the carboxylic acid buffers', () => {
    // The claim the table exists to support: a buffer's temperature sensitivity
    // varies by two orders of magnitude across this set, so one blanket
    // statement about "temperature effects" would be wrong for most of them.
    const drift = (name, to) => {
      const { pKa25, deltaH } = PKA_ENTHALPY[name];
      return Math.abs(pKaAt({ pKa25, deltaH, tempC: to }) - pKa25);
    };
    expect(drift('tris', 20)).toBeGreaterThan(0.1);
    expect(drift('acetate', 20)).toBeLessThan(0.002);
    expect(drift('tris', 20) / drift('acetate', 20)).toBeGreaterThan(50);
  });
});

describe('gammaFor', () => {
  it('should leave a neutral species uncorrected at any ionic strength', () => {
    for (const I of [0, 0.05, 0.5]) expect(gammaFor(0, I)).toBe(1);
  });

  it('should match the published Davies value at I = 0.1', () => {
    // γ for a singly-charged ion at I = 0.1 is 0.78 in every buffer table.
    expect(gammaFor(1, 0.1)).toBeCloseTo(0.78, 2);
  });
});

describe('hendersonHasselbalchActivity', () => {
  it('should reduce to the ideal equation at zero ionic strength', () => {
    const ideal = hendersonHasselbalch({ pKa: 4.76, acidConc: 0.1, baseConc: 0.1 });
    const real = hendersonHasselbalchActivity({ pKa: 4.76, acidConc: 0.1, baseConc: 0.1, ionicStrength: 0 });
    expect(real.ph).toBeCloseTo(ideal, 10);
    expect(real.shift).toBeCloseTo(0, 10);
  });

  it('should lower the pH of an acid buffer at bench ionic strength', () => {
    /*
     * Acetate at I = 0.1: the base (A⁻) is shielded, the acid (HA) is not, so
     * the effective ratio falls and the pH with it. Published shift is about
     * −0.10 at this ionic strength.
     */
    const r = hendersonHasselbalchActivity({ pKa: 4.76, acidConc: 0.1, baseConc: 0.1, ionicStrength: 0.1 });
    expect(r.shift).toBeLessThan(0);
    expect(r.shift).toBeCloseTo(-0.109, 2);
    expect(r.ph).toBeCloseTo(4.651, 2);
  });

  it('should raise the pH of a base buffer at the same ionic strength', () => {
    // Ammonia buffer: the acid form (NH₄⁺) is the charged one, so the sign of
    // the shift flips. This is why the charges are parameters.
    const r = hendersonHasselbalchActivity({
      pKa: 9.25, acidConc: 0.1, baseConc: 0.1, ionicStrength: 0.1, acidCharge: 1, baseCharge: 0,
    });
    expect(r.shift).toBeGreaterThan(0);
    expect(r.ph).toBeCloseTo(9.359, 2);
  });

  it('should flag an ionic strength past the range the Davies fit covers', () => {
    const r = hendersonHasselbalchActivity({ pKa: 4.76, acidConc: 0.1, baseConc: 0.1, ionicStrength: 1.0 });
    expect(r.inDaviesRange).toBe(false);
  });

  it('should reject a zero concentration rather than returning infinity', () => {
    expect(() => hendersonHasselbalchActivity({ pKa: 4.76, acidConc: 0, baseConc: 0.1 })).toThrow();
  });
});

describe('weakAcidPhActivity', () => {
  it('should confirm the ideal model for a neutral acid rather than inventing a shift', () => {
    /*
     * For HA with z = 0 the acid form has γ = 1 and the other two are both
     * singly charged, so γ_H = γ_A and the corrections cancel: x scales as
     * 1/γ_H and the pH is −log(γ_H·x). The residual is a thousandth of a unit
     * even at I = 0.5.
     *
     * This is the assertion that the module is honest. A version that
     * "corrected" acetic acid by 0.05 would pass a self-consistency check and
     * be wrong about the chemistry.
     */
    const ideal = weakAcidPh({ pKa: 4.76, conc: 0.1 });
    for (const I of [0, 0.1, 0.5]) {
      const r = weakAcidPhActivity({ pKa: 4.76, conc: 0.1, ionicStrength: I });
      expect(Math.abs(r.ph - ideal), `I=${I}`).toBeLessThan(0.01);
    }
  });

  it('should agree with the ideal model for a dilute neutral acid', () => {
    const ideal = weakAcidPh({ pKa: 4.76, conc: 0.001 });
    const real = weakAcidPhActivity({ pKa: 4.76, conc: 0.001 });
    expect(Math.abs(real.ph - ideal)).toBeLessThan(0.05);
  });

  it('should lower the pH of a charged acid by a real amount', () => {
    /*
     * Dihydrogen phosphate, pKa₂ = 7.20, z = −1. Here γ_HA is not 1 — the acid
     * form is charged too, and γ_A (z = −2) is smaller still — so the
     * cancellation that saves the neutral case does not happen.
     *
     * Published shift between I = 0 and I = 0.1 is about −0.11 for this pair.
     */
    const free = weakAcidPhActivity({ pKa: 7.20, conc: 0.1, charge: -1 });
    const salted = weakAcidPhActivity({ pKa: 7.20, conc: 0.1, charge: -1, ionicStrength: 0.1 });
    expect(salted.ph).toBeLessThan(free.ph);
    expect(salted.ph - free.ph).toBeCloseTo(-0.100, 2);
  });

  it('should raise the pH of a cationic acid', () => {
    // Ammonium (pKa 9.25, z = +1): the acid form is the charged one, so the
    // correction runs the other way. This is the case the charges exist for.
    const free = weakAcidPhActivity({ pKa: 9.25, conc: 0.1, charge: 1 });
    const salted = weakAcidPhActivity({ pKa: 9.25, conc: 0.1, charge: 1, ionicStrength: 0.1 });
    expect(salted.ph).toBeGreaterThan(free.ph);
    expect(salted.ph - free.ph).toBeCloseTo(0.106, 2);
  });

  it('should solve the ionic strength self-consistently for a neutral acid', () => {
    // Charge balance for HA: the only ions are H⁺ and A⁻, so I = [H⁺] = x.
    const r = weakAcidPhActivity({ pKa: 4.76, conc: 0.01 });
    expect(r.ionicStrength).toBeCloseTo(r.concH, 12);
    expect(r.ph).toBeCloseTo(-Math.log10(r.gammaH * r.concH), 12);
  });

  it('should solve the ionic strength self-consistently for a charged acid', () => {
    // For z = −1 the ions are H⁺ (charge 1) and A²⁻ (charge −2) at x each, so
    // I = ½(x·1 + x·4) = 2.5x. Getting this factor wrong would put the ionic
    // strength 2.5× off and the correction with it.
    const r = weakAcidPhActivity({ pKa: 7.20, conc: 0.1, charge: -1 });
    expect(r.ionicStrength).toBeCloseTo(2.5 * r.concH, 12);
  });

  it('should match a hand-solved quadratic at a given ionic strength', () => {
    /*
     * The one case where the answer can be computed independently: fix I, and
     * the quadratic has a closed form. γ_H = γ_A = γ at z = 0, so
     *   γ²x² + Ka·x − Ka·C = 0.
     */
    const pKa = 4.76;
    const C = 0.05;
    const I = 0.2;
    const gamma = 10 ** (-0.51 * (Math.sqrt(I) / (1 + Math.sqrt(I)) - 0.3 * I));
    const ka = 10 ** -pKa;
    const x = (-ka + Math.sqrt(ka ** 2 + 4 * gamma ** 2 * ka * C)) / (2 * gamma ** 2);
    const expected = -Math.log10(gamma * x);
    const r = weakAcidPhActivity({ pKa, conc: C, ionicStrength: I });
    expect(r.ph).toBeCloseTo(expected, 10);
  });

  it('should use a supplied background ionic strength instead of solving for it', () => {
    const free = weakAcidPhActivity({ pKa: 7.20, conc: 0.1, charge: -1 });
    const salted = weakAcidPhActivity({ pKa: 7.20, conc: 0.1, charge: -1, ionicStrength: 0.15 });
    expect(salted.ionicStrength).toBe(0.15);
    expect(salted.ph).not.toBeCloseTo(free.ph, 3);
  });

  it('should flag an ionic strength past the range the Davies fit covers', () => {
    const r = weakAcidPhActivity({ pKa: 7.20, conc: 0.1, charge: -1, ionicStrength: 1.0 });
    expect(r.inDaviesRange).toBe(false);
  });

  it('should reject a zero concentration', () => {
    expect(() => weakAcidPhActivity({ pKa: 4.76, conc: 0 })).toThrow();
  });

  it('should reject a fractional charge', () => {
    expect(() => weakAcidPhActivity({ pKa: 4.76, conc: 0.1, charge: 0.5 })).toThrow();
  });
});

describe('ionicStrengthOf', () => {
  it('should give I = 0.1 for a 0.1 M 1:1 salt', () => {
    const r = ionicStrengthOf({ ions: [{ conc: 0.1, charge: 1 }, { conc: 0.1, charge: -1 }] });
    expect(r.ionicStrength).toBeCloseTo(0.1, 10);
    expect(r.inDaviesRange).toBe(true);
  });

  it('should count a divalent ion four times as heavily', () => {
    // ½(0.1·4) = 0.2 from the calcium alone; the chloride adds ½(0.2·1) = 0.1.
    const r = ionicStrengthOf({ ions: [{ conc: 0.1, charge: 2 }, { conc: 0.2, charge: -1 }] });
    expect(r.ionicStrength).toBeCloseTo(0.3, 10);
  });

  it('should flag a seawater-strength solution as out of range', () => {
    const r = ionicStrengthOf({ ions: [{ conc: 0.6, charge: 1 }, { conc: 0.6, charge: -1 }] });
    expect(r.ionicStrength).toBeCloseTo(0.6, 10);
    expect(r.inDaviesRange).toBe(false);
  });
});

describe('correctedBuffer', () => {
  it('should reproduce the ideal answer when nothing is corrected', () => {
    // deltaH 0 and no charges anywhere means the whole correction chain is a
    // no-op — the test that the function is a strict extension, not a
    // replacement for the ideal model.
    const r = correctedBuffer({
      pKa25: 4.76, deltaH: 0, targetPh: 5.0, totalConc: 0.1, baseCharge: 0,
    });
    expect(r.pKa).toBe(4.76);
    expect(r.ionicStrength).toBe(0);
    expect(r.ph).toBeCloseTo(5.0, 10);
    expect(r.idealPh).toBeCloseTo(5.0, 10);
  });

  it('should lower an acetate buffer by about a tenth at bench concentration', () => {
    /*
     * 0.1 M acetate at pH 5.0. The recipe puts 0.064 M of acetate ion (and its
     * sodium) in solution, so I = 0.064 — not 0.1, because the acid form is
     * neutral and only the base contributes. γ± at that I is 0.80, and the
     * shift is log₁₀(0.80) = −0.096.
     *
     * Measured pH of this buffer is 4.91 against a recipe that says 5.00.
     */
    const r = correctedBuffer({ pKa25: 4.76, deltaH: -0.41, targetPh: 5.0, totalConc: 0.1 });
    expect(r.ionicStrength).toBeCloseTo(0.0635, 3);
    expect(r.ph).toBeCloseTo(4.907, 2);
    expect(r.ph).toBeLessThan(r.idealPh);
  });

  it('should move a Tris buffer by more than half a unit between 25 and 4 degrees', () => {
    /*
     * The headline case, and the one a bench worker actually gets wrong. A Tris
     * buffer made at the bench and used in a cold room reads about 0.63 units
     * more alkaline than its recipe — the whole useful range of the buffer.
     *
     * Note the direction: the *recipe's* pH (idealPh) also moves, because the
     * ratio was computed from the target at the working pKa. What the test pins
     * is that the corrected pH tracks the temperature while the ideal one is a
     * fiction.
     */
    const warm = correctedBuffer({
      pKa25: 8.06, deltaH: -47.7, targetPh: 8.0, totalConc: 0.05, acidCharge: 1, baseCharge: 0,
    });
    const cold = correctedBuffer({
      pKa25: 8.06, deltaH: -47.7, targetPh: 8.0, totalConc: 0.05, tempC: 4, acidCharge: 1, baseCharge: 0,
    });
    expect(cold.pKa - warm.pKa).toBeCloseTo(0.633, 2);
    expect(cold.idealPh - warm.idealPh).toBeCloseTo(-0.633, 2);
    // The recipe has to change to hold the same reading — which is what a
    // temperature correction is for.
    expect(cold.ph).toBeCloseTo(warm.ph, 1);
  });

  it('should leave a carboxylic acid buffer almost unmoved by temperature', () => {
    const warm = correctedBuffer({ pKa25: 4.76, deltaH: -0.41, targetPh: 5.0, totalConc: 0.1 });
    const cold = correctedBuffer({ pKa25: 4.76, deltaH: -0.41, targetPh: 5.0, totalConc: 0.1, tempC: 4 });
    expect(Math.abs(cold.pKa - warm.pKa)).toBeLessThan(0.01);
  });

  it('should give phosphate its published apparent pKa in 0.1 M medium', () => {
    /*
     * The second pKa of phosphate falls from 7.20 to about 6.8 in 0.1 M medium
     * — the largest shift of any common buffer, because the two forms differ by
     * a whole unit of charge. This is why a phosphate buffer made by the
     * textbook recipe reads low on a meter.
     *
     * I = 0.2, not 0.1: half the buffer is H₂PO₄⁻ (charge −1), half is HPO₄²⁻
     * (charge −2), and the sodium that came with them is +0.15. The
     * ½Σcz² gives ½(0.05·1 + 0.05·4 + 0.15·1) = 0.2. A calculation that
     * counted only the buffer's own ions would report 0.125 and miss a third of
     * the correction.
     */
    const r = correctedBuffer({
      pKa25: 7.20, deltaH: -8.0, targetPh: 7.2, totalConc: 0.1, acidCharge: -1, baseCharge: -2,
    });
    expect(r.ionicStrength).toBeCloseTo(0.2, 6);
    expect(r.ph).toBeCloseTo(6.819, 2);
    expect(r.ph - r.idealPh).toBeCloseTo(-0.381, 2);
  });

  it('should raise the ionic strength when a background salt is declared', () => {
    const base = { pKa25: 7.20, deltaH: -8.0, targetPh: 7.2, totalConc: 0.1, acidCharge: -1, baseCharge: -2 };
    const plain = correctedBuffer(base);
    const salted = correctedBuffer({ ...base, backgroundSalt: 0.15 });
    expect(salted.ionicStrength).toBeCloseTo(plain.ionicStrength + 0.15, 6);
    expect(salted.ph).toBeLessThan(plain.ph);
  });

  it('should apply the temperature to the pKa before computing the ratio', () => {
    /*
     * Order matters and this pins it. If the ratio were computed at the 25 °C
     * pKa and the temperature applied afterwards, the acid and base
     * concentrations would be the ones for a 25 °C recipe — a different pair of
     * numbers, because the ratio is exponential in the pKa.
     *
     * Checked by recomputing the ratio from the returned pKa and comparing.
     */
    const r = correctedBuffer({
      pKa25: 8.06, deltaH: -47.7, targetPh: 8.0, totalConc: 0.05, tempC: 4, acidCharge: 1, baseCharge: 0,
    });
    expect(r.ratio).toBeCloseTo(10 ** (8.0 - r.pKa), 10);
    // And that is not the ratio the 25 °C pKa would have given.
    expect(r.ratio).not.toBeCloseTo(10 ** (8.0 - 8.06), 3);
  });

  it('should split the total concentration between the two forms', () => {
    const r = correctedBuffer({ pKa25: 4.76, deltaH: -0.41, targetPh: 5.0, totalConc: 0.1 });
    expect(r.acidConc + r.baseConc).toBeCloseTo(0.1, 12);
    expect(r.baseConc / r.acidConc).toBeCloseTo(r.ratio, 10);
  });

  it('should flag an ionic strength past the Davies range', () => {
    const r = correctedBuffer({
      pKa25: 7.20, deltaH: -8.0, targetPh: 7.2, totalConc: 0.4, acidCharge: -1, baseCharge: -2,
    });
    expect(r.ionicStrength).toBeCloseTo(0.8, 6);
    expect(r.inDaviesRange).toBe(false);
  });

  it('should reject a negative background salt concentration', () => {
    expect(() => correctedBuffer({
      pKa25: 4.76, targetPh: 5.0, totalConc: 0.1, backgroundSalt: -0.1,
    })).toThrow();
  });

  it('should reject a zero total concentration', () => {
    expect(() => correctedBuffer({ pKa25: 4.76, targetPh: 5.0, totalConc: 0 })).toThrow();
  });
});

describe('BUFFER_PRESETS', () => {
  it('should list every buffer in the enthalpy table', () => {
    expect(BUFFER_PRESETS.map((p) => p.name).sort()).toEqual(Object.keys(PKA_ENTHALPY).sort());
  });

  it('should offer pKb for a base and pKa for an acid', () => {
    const tris = bufferPreset('tris');
    expect(tris.kind).toBe('base');
    expect(tris.presetPk).toBeCloseTo(14 - 8.06, 10);
    const acetate = bufferPreset('acetate');
    expect(acetate.kind).toBe('acid');
    expect(acetate.presetPk).toBe(4.76);
  });

  it('should classify a buffer by what is pipetted, not by its pKa', () => {
    // Pyridine's pKa is 5.23 — below 7, alongside every carboxylic acid in the
    // table — but what goes in the beaker is pyridine, a base, so it belongs on
    // the base half of the pH tab. Classifying by `pKa < 7` would put it on the
    // wrong side and ask the user for a pKa where the tab wants a pKb.
    expect(bufferPreset('pyridine').kind).toBe('base');
    expect(bufferPreset('pyridine').pKa25).toBeLessThan(7);
    expect(bufferPreset('pyridine').presetPk).toBeCloseTo(14 - 5.23, 10);
    // And an anionic acid is an acid: NaH₂PO₄ is dissolved as the acid form.
    expect(bufferPreset('phosphate2').kind).toBe('acid');
  });

  it('should carry the charges each preset needs to be corrected', () => {
    // A preset without charges cannot be fed to `correctedBuffer`, so the two
    // tables have to agree — and a wrong charge is invisible in the pKa.
    expect(bufferPreset('acetate')).toMatchObject({ acidCharge: 0, baseCharge: -1 });
    expect(bufferPreset('phosphate2')).toMatchObject({ acidCharge: -1, baseCharge: -2 });
    expect(bufferPreset('tris')).toMatchObject({ acidCharge: 1, baseCharge: 0 });
    for (const p of BUFFER_PRESETS) {
      expect(Number.isInteger(p.acidCharge), p.name).toBe(true);
      expect(Number.isInteger(p.baseCharge), p.name).toBe(true);
      // And the two forms must actually differ by a proton.
      expect(p.acidCharge - p.baseCharge, p.name).toBe(1);
    }
  });
});

describe('the correction as a whole', () => {
  it('should change a real buffer recipe by more than its own round-off', () => {
    /*
     * The headline claim of the module: at a concentration people actually
     * pipette, ignoring activity is a bigger error than the display precision.
     * If this ever stops being true the module is not earning its place.
     */
    const recipe = bufferRecipe({ pKa: 4.76, targetPh: 5.0, totalConc: 0.1 });
    // Acetate buffer, with the sodium that came with the acetate.
    const { ionicStrength } = ionicStrengthOf({
      ions: [{ conc: recipe.baseConc, charge: -1 }, { conc: recipe.baseConc, charge: 1 }],
    });
    const real = hendersonHasselbalchActivity({
      pKa: 4.76, acidConc: recipe.acidConc, baseConc: recipe.baseConc, ionicStrength,
    });
    // The recipe was computed to give pH 5.00; with activities it does not.
    expect(Math.abs(real.ph - 5.0)).toBeGreaterThan(0.05);
  });
});

describe('the base direction, worked through the acid routine', () => {
  /*
   * The pH tab works a base by calling `weakAcidPhActivity` with pKb, and
   * reading the result as a **pOH** — the two equilibria are the same equation
   * with OH⁻ in the proton's role. That reuse is only correct if the returned
   * number is the pOH and the charge passed is the one the routine expects, so
   * both are pinned here rather than left to the tab's comment.
   *
   * The trap this guards: a neutral base's *conjugate acid* is a cation, which
   * invites passing z = +1. That is wrong, and wrong by 0.10 pH units at
   * I = 0.1 — an error the size of the correction itself, in the direction that
   * makes the tab look like it is working.
   */
  it('should return the pOH when given a base pKb', () => {
    // Ammonia: pKb 4.75, so the ideal pOH is 0.5*(4.75 - log10(0.1)) = 2.875.
    const r = weakAcidPhActivity({ pKa: 4.75, conc: 0.1, charge: 0 });
    expect(r.ph).toBeCloseTo(2.875, 2);
    // Which is pH 11.125.
    expect(14 - r.ph).toBeCloseTo(11.125, 2);
  });

  it('should barely move a neutral base, as it barely moves a neutral acid', () => {
    /*
     * The same cancellation that leaves acetic acid alone: the species that
     * stays neutral is B, so gamma_B = 1, and the proton and hydroxide terms
     * cancel. Reported as the small number it is rather than manufactured into
     * a visible shift.
     */
    const ideal = 0.5 * (4.75 - Math.log10(0.1));
    for (const I of [0.1, 0.5]) {
      const r = weakAcidPhActivity({ pKa: 4.75, conc: 0.1, charge: 0, ionicStrength: I });
      expect(Math.abs(r.ph - ideal), `I=${I}`).toBeLessThan(0.01);
    }
  });

  it('should over-correct a neutral base if the conjugate acid charge is used', () => {
    // The documented failure mode. z = +1 is the cation BH+, which is not the
    // species in the equilibrium being solved.
    const ideal = 0.5 * (4.75 - Math.log10(0.1));
    const wrong = weakAcidPhActivity({ pKa: 4.75, conc: 0.1, charge: 1, ionicStrength: 0.1 });
    expect(Math.abs(wrong.ph - ideal)).toBeGreaterThan(0.09);
  });

  it('should agree with the ideal model when I is zero, to the approximation’s own error', () => {
    /*
     * At I = 0 every gamma is 1, so the only difference left is the one between
     * the two models' *arithmetic*: `weakAcidPh` uses the approximation
     * [H+] = sqrt(Ka*C), while `weakAcidPhActivity` solves the quadratic
     * exactly. Those differ by about 0.003 pH units at 0.1 M, and that gap is
     * not an activity effect — it is the approximation's own error, which the
     * tab already discloses in its warning.
     *
     * Asserted at that tolerance rather than at machine precision, because
     * demanding equality would be demanding the exact model back and would
     * make this test fail the moment the quadratic is solved more carefully.
     */
    for (const [pk, conc, charge] of [[4.76, 0.1, 0], [7.20, 0.1, -1], [9.25, 0.1, 1]]) {
      const r = weakAcidPhActivity({ pKa: pk, conc, charge, ionicStrength: 0 });
      expect(r.ph, `pKa=${pk}`).toBeCloseTo(weakAcidPh({ pKa: pk, conc }), 2);
    }
  });

  it('should keep every gamma at one when I is zero', () => {
    // The reason the check above is meaningful: with no ionic strength there is
    // nothing for the activity terms to do, so they must all be exactly 1.
    const r = weakAcidPhActivity({ pKa: 7.20, conc: 0.1, charge: -1, ionicStrength: 0 });
    expect(r.gammaH).toBe(1);
    expect(r.gammaAcid).toBe(1);
    expect(r.gammaBase).toBe(1);
  });
});
