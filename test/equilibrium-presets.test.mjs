import { describe, it, expect } from 'vitest';
import { speciate } from '../src/calc/equilibrium.mjs';
import { EQUILIBRIUM_PRESETS, presetById } from '../src/calc/equilibrium-presets.mjs';

/**
 * The built-in systems, checked against their own stated expectations.
 *
 * ## What these catch that the solver tests do not
 *
 * `equilibrium.test.mjs` proves the solver is right. These prove the
 * *constants* are right, which is a different failure with a different
 * signature: a mistyped log K produces a converged, smooth, confidently wrong
 * answer, and no amount of solver testing notices. The `check` field on each
 * preset is the expectation, written next to the constants so that editing one
 * without the other is visibly inconsistent.
 *
 * The other thing asserted here is that each preset actually demonstrates what
 * its `question` claims. That is not pedantry: the AgCl-in-ammonia preset had
 * totals below the solubility in ammonia, so it dissolved completely and
 * showed no solid — a preset titled "why does AgCl dissolve in ammonia" that
 * answered "it all dissolves, so the question does not arise". A test that
 * only checked "converged" would have passed it.
 */

describe('equilibrium presets', () => {
  it('should all converge, with every preset solving cleanly', () => {
    for (const p of EQUILIBRIUM_PRESETS) {
      const out = speciate(p.spec);
      expect(out.converged, `${p.id} should converge`).toBe(true);
      expect(out.residual, `${p.id} residual`).toBeLessThan(1e-9);
    }
  });

  it('should give the molar solubility of AgCl in pure water', () => {
    const out = speciate(presetById('agcl-water').spec);
    /*
     * The preset stores log Ksp = −9.75, which is 1.778e-10, so the
     * solubility is √(1.778e-10) = 1.3335e-5. The assertion derives that from
     * the stored constant rather than restating a rounded literature figure:
     * comparing a full-precision answer against a value rounded to three
     * digits tests the rounding, not the chemistry, and fails by 4.8e-9 while
     * the model is correct to twelve digits.
     */
    expect(out.free.Ag).toBeCloseTo(Math.sqrt(10 ** -9.75), 12);
    expect(out.solids[0].present).toBe(true);
  });

  it('should dissolve AgCl in ammonia while driving the free Ag+ down', () => {
    /*
     * The preset's whole point, asserted as the contrast rather than as either
     * half alone: the free ion falls by four orders of magnitude *and* solid
     * is still dissolving. Either number on its own is consistent with a model
     * that ignores the complex; only both together show the coupling.
     */
    const out = speciate(presetById('agcl-ammonia').spec);
    const water = speciate(presetById('agcl-water').spec);

    expect(out.free.Ag).toBeLessThan(1e-7);
    expect(out.free.Ag).toBeLessThan(water.free.Ag / 1000);
    expect(out.solids[0].present).toBe(true);

    // And the dissolved silver is mostly the diammine, not the free ion.
    const diammine = out.species.find((s) => s.id === 'AgNH32');
    expect(diammine.conc).toBeGreaterThan(out.free.Ag * 1e5);
  });

  it('should dissolve CaCO3 well past sqrt(Ksp) because the anion is a base', () => {
    /*
     * The second coupling, and the one that catches a solver which only
     * handles a ligand as a separate component. At pH 7 nearly all the
     * carbonate is HCO₃⁻, which does not appear in the Ksp expression, so the
     * free CO₃²⁻ stays low and the free Ca²⁺ is far above √(3.3e-9) = 5.7e-5
     * — wait, above: 2.94e-3, which is 51× the square root.
     *
     * The ratio is asserted rather than the value, because the ratio is the
     * chemistry: a model without the protonation would give exactly the square
     * root, and that is the wrong answer this preset exists to distinguish.
     */
    const out = speciate(presetById('caco3-water').spec);
    const sqrtKsp = Math.sqrt(3.3e-9);
    expect(out.free.Ca / sqrtKsp).toBeGreaterThan(10);
    expect(out.solids[0].present).toBe(true);
  });

  it('should make the tetraammine the dominant copper species at 0.2 M ammonia', () => {
    /*
     * Stepwise constants, and the answer is the fourth complex — which is the
     * check that the cumulative sums were built correctly. A wrong cumulative
     * sum shifts the distribution toward a lower complex and the answer still
     * converges, so asserting the *identity* of the dominant species is what
     * catches it; asserting a concentration would not, because a different
     * constant gives a different-but-plausible concentration.
     */
    const out = speciate(presetById('cu-ammonia').spec);
    const copper = out.species.filter((s) => s.id.startsWith('Cu'));
    const dominant = copper.reduce((a, b) => (b.conc > a.conc ? b : a));
    expect(dominant.id).toBe('CuNH34');
    // And essentially all the copper is complexed, none free.
    expect(out.free.Cu).toBeLessThan(1e-9);
  });

  it('should keep every preset answerable in both languages', () => {
    // The label and the question are the only things a user sees before
    // choosing, so a missing translation is a preset that cannot be selected.
    for (const p of EQUILIBRIUM_PRESETS) {
      for (const lang of ['zh', 'en']) {
        expect(p.label[lang], `${p.id} label.${lang}`).toBeTruthy();
        expect(p.question[lang], `${p.id} question.${lang}`).toBeTruthy();
      }
      expect(p.source, `${p.id} source`).toBeTruthy();
    }
  });

  it('should name a source for every constant, so the inputs are checkable', () => {
    // A speciation answer is only as good as its constants. A user who wants
    // to verify the arithmetic has no other way to verify the inputs.
    for (const p of EQUILIBRIUM_PRESETS) {
      expect(p.source.length, `${p.id} source should say where the numbers are from`)
        .toBeGreaterThan(10);
    }
  });

  it('should keep every complex cumulative, not a mixture of tabulated forms', () => {
    /*
     * The defect this catches is specific and was real: the silver preset
     * originally quoted log K₁ = 3.31 from one table and log β₂ = 7.23 from
     * another. Both numbers are in circulation, and together they imply
     * K₂ = 3.92, which is neither of the values any table prints. The solver
     * cannot tell — it just uses 3.31 and 7.23 as given, converges, and returns
     * a distribution built on an inconsistency.
     *
     * The check is that every complex's log K equals the sum of the stepwise
     * constants it is built from. `stepwise` is the preset's own declaration
     * of those, so the assertion compares the number in the solver against the
     * number in the source line rather than against a third copy.
     */
    for (const p of EQUILIBRIUM_PRESETS) {
      for (const cx of p.spec.complexes ?? []) {
        const ligands = Object.values(cx.ligands).reduce((a, b) => a + b, 0);
        if (!cx.stepwise) continue;
        expect(cx.stepwise, `${p.id}/${cx.id} should list ${ligands} stepwise constants`)
          .toHaveLength(ligands);
        const sum = cx.stepwise.reduce((a, b) => a + b, 0);
        expect(cx.logK, `${p.id}/${cx.id} log K should be the sum of its stepwise constants`)
          .toBeCloseTo(sum, 10);
      }
    }
  });

  it('should build each complex from the stepwise constants its source quotes', () => {
    // And the constants must be present, not merely self-consistent: a preset
    // that declared `stepwise: [cx.logK]` would satisfy the sum check while
    // documenting nothing.
    const withStepwise = EQUILIBRIUM_PRESETS
      .flatMap((p) => (p.spec.complexes ?? []).map((c) => ({ preset: p.id, cx: c })))
      .filter(({ cx }) => cx.stepwise);
    expect(withStepwise.length, 'at least one preset should document stepwise constants')
      .toBeGreaterThan(0);
    for (const { preset, cx } of withStepwise) {
      // Every stepwise value must also appear in the preset's source line, so
      // the reader can find where each came from.
      const p = presetById(preset);
      for (const k of cx.stepwise) {
        expect(p.source, `${preset}/${cx.id}: ${k} should appear in the source line`)
          .toContain(String(k));
      }
    }
  });
});
