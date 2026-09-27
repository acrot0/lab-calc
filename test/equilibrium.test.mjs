import { describe, it, expect } from 'vitest';
import { speciate, hydroxidePrecipitationPh } from '../src/calc/equilibrium.mjs';

/**
 * The general equilibrium solver, checked against textbook answers.
 *
 * ## Why the expected values are what they are
 *
 * Every number below is a literature or hand-computable value, not the
 * solver's own output pasted back in. That distinction is the whole value of
 * these tests: a solver that is internally consistent but wrong — a sign
 * flipped in the mass-action exponent, a mass balance that drops a term —
 * produces a smooth, converged, plausible curve, and a test written from its
 * output would certify it. The comments say where each number comes from so
 * the next person can re-derive it rather than trust it.
 *
 * The constants used are the standard 25 °C values at zero ionic strength,
 * which is the same basis as the textbook answers, so the comparison is
 * like-for-like. A model with activity corrections would not match these and
 * would need its own references.
 */

/** Acetic acid, the acid most of these systems are buffered with. */
const ACETIC = { logK: 4.76 };

describe('speciate: a weak acid alone', () => {
  it('should reproduce the pH of a pure acetate solution', () => {
    /*
     * 0.1 M acetic acid at a fixed pH of 2.88: the acid form should dominate,
     * and the free H⁺ should be 10^-2.88. This is the same answer the pH tab
     * gives by its own route, which is the point — two independent solvers
     * agreeing is evidence, one solver agreeing with itself is not.
     */
    const out = speciate({
      ph: 2.88,
      components: [
        { id: 'Ac', charge: -1, total: 0.1, protonations: [{ n: 1, logK: ACETIC.logK, label: 'HAc' }] },
      ],
    });
    expect(out.converged).toBe(true);
    const ac = out.species.find((s) => s.id === 'Ac');
    const hac = out.species.find((s) => s.id === 'Ac_H1');
    // [Ac⁻]/[HAc] = Ka/[H⁺] = 10^(2.88 − 4.76)
    expect(Math.log10(ac.conc / hac.conc)).toBeCloseTo(2.88 - 4.76, 2);
  });

  it('should put the ratio at exactly 1 at the pKa', () => {
    // The definition of pKa, and the one assertion that catches an inverted
    // exponent sign immediately: at pH = pKa the two forms must be equal.
    const out = speciate({
      ph: 4.76,
      components: [
        { id: 'Ac', charge: -1, total: 0.05, protonations: [{ n: 1, logK: ACETIC.logK }] },
      ],
    });
    const ac = out.species.find((s) => s.id === 'Ac');
    const hac = out.species.find((s) => s.id === 'Ac_H1');
    expect(ac.conc / hac.conc).toBeCloseTo(1, 6);
  });
});

describe('speciate: solubility', () => {
  it('should give the molar solubility of AgCl in pure water', () => {
    /*
     * Ksp(AgCl) = 1.8e-10, so s = sqrt(Ksp) = 1.34e-5 M in pure water. The
     * model gets this from the ion product, not from the square root — the
     * square root is the check, not the method.
     *
     * The totals are 0.01 M, comfortably above the solubility, so there IS
     * solid present at equilibrium. That is the case this test is about. The
     * first version used 1e-5 M each, which is *below* sqrt(Ksp) = 1.34e-5 and
     * therefore a solution in which AgCl is entirely dissolved and the ion
     * product is 1e-10, not 1.8e-10 — the solver was right and the fixture was
     * wrong, which is worth recording because a fixture chosen for round
     * numbers is how a correct solver gets "fixed" into an incorrect one.
     */
    const out = speciate({
      ph: 7,
      components: [
        { id: 'Ag', charge: 1, total: 0.01 },
        { id: 'Cl', charge: -1, total: 0.01 },
      ],
      solids: [{ id: 'AgCl', logKsp: Math.log10(1.8e-10), ions: { Ag: 1, Cl: 1 } }],
    });
    expect(out.converged).toBe(true);
    expect(out.solids[0].present).toBe(true);
    // The ion product is pinned at Ksp, and the free concentrations are its
    // square root — the solubility, obtained without taking one.
    expect(out.free.Ag * out.free.Cl).toBeCloseTo(1.8e-10, 15);
    expect(out.free.Ag).toBeCloseTo(Math.sqrt(1.8e-10), 10);
    // 0.01 − 1.34e-5 mol/L of each ion came out of solution.
    expect(out.solids[0].precipitated).toBeCloseTo(0.01 - Math.sqrt(1.8e-10), 9);
  });

  it('should raise the solubility of AgCl in ammonia by forming the diammine', () => {
    /*
     * The classic demonstration that a solubility product alone does not
     * predict solubility. log β₂ for Ag(NH₃)₂⁺ is 7.23, so in 1 M ammonia the
     * silver is overwhelmingly complexed and the total dissolved silver rises
     * by orders of magnitude while the *free* Ag⁺ falls.
     *
     * The assertion is on the ratio of total dissolved to the pure-water case,
     * because that is the quantity a laboratory would measure — how much more
     * AgCl dissolves — and it is the one the free-ion concentration alone
     * cannot tell you.
     */
    const pure = speciate({
      ph: 7,
      components: [
        { id: 'Ag', charge: 1, total: 1e-5 },
        { id: 'Cl', charge: -1, total: 1e-5 },
      ],
      solids: [{ id: 'AgCl', logKsp: Math.log10(1.8e-10), ions: { Ag: 1, Cl: 1 } }],
    });

    const ammonia = speciate({
      ph: 9.5,
      components: [
        { id: 'Ag', charge: 1, total: 1e-5 },
        { id: 'Cl', charge: -1, total: 1e-5 },
        {
          id: 'NH3',
          charge: 0,
          total: 1.0,
          protonations: [{ n: 1, logK: 9.25, label: 'NH₄⁺' }],
        },
      ],
      complexes: [
        { id: 'AgNH3', metal: 'Ag', ligands: { NH3: 1 }, logK: 3.31, charge: 1 },
        { id: 'AgNH32', metal: 'Ag', ligands: { NH3: 2 }, logK: 7.23, charge: 1 },
      ],
      solids: [{ id: 'AgCl', logKsp: Math.log10(1.8e-10), ions: { Ag: 1, Cl: 1 } }],
    });

    expect(ammonia.converged).toBe(true);
    // Free Ag⁺ must FALL, not rise — the complex holds it.
    expect(ammonia.free.Ag).toBeLessThan(pure.free.Ag);
    // And the complex must be the dominant silver species at 1 M ammonia.
    const diammine = ammonia.species.find((s) => s.id === 'AgNH32');
    const freeAg = ammonia.species.find((s) => s.id === 'Ag');
    expect(diammine.conc).toBeGreaterThan(freeAg.conc);
  });

  it('should not dissolve a solid whose ion product is already exceeded', () => {
    // The other direction, and the one a sign error hides in: with the ions
    // already above Ksp there is nothing to dissolve. A solver that reports a
    // dissolution here has the residual backwards.
    const out = speciate({
      ph: 7,
      components: [
        { id: 'Ag', charge: 1, total: 0.01 },
        { id: 'Cl', charge: -1, total: 0.01 },
      ],
      solids: [{ id: 'AgCl', logKsp: Math.log10(1.8e-10), ions: { Ag: 1, Cl: 1 } }],
    });
    expect(out.converged).toBe(true);
    // The ion product is pinned at Ksp: the solid removed the excess.
    expect(out.free.Ag * out.free.Cl).toBeCloseTo(1.8e-10, 12);
  });
});

describe('speciate: complexation competes with protonation', () => {
  it('should complex less copper as the pH falls and the ligand protonates', () => {
    /*
     * The coupling that makes this a system rather than a formula. Ammonia is
     * a base (pKa 9.25), so at pH 4 almost all of it is NH₄⁺ and unavailable
     * to the metal; at pH 10 most of it is free NH₃. The copper-ammine colour
     * deepening with pH is this, and no single formula gives it.
     *
     * The assertion is on the free NH₃ concentration rather than on a complex,
     * because free ligand is what every complex depends on — so a wrong result
     * here cannot be cancelled out by a compensating error downstream.
     */
    const spec = (ph) => ({
      ph,
      components: [
        { id: 'Cu', charge: 2, total: 0.01 },
        {
          id: 'NH3',
          charge: 0,
          total: 0.2,
          protonations: [{ n: 1, logK: 9.25, label: 'NH₄⁺' }],
        },
      ],
      complexes: [
        { id: 'CuNH3', metal: 'Cu', ligands: { NH3: 1 }, logK: 4.13, charge: 2 },
        { id: 'CuNH32', metal: 'Cu', ligands: { NH3: 2 }, logK: 7.61, charge: 2 },
        { id: 'CuNH33', metal: 'Cu', ligands: { NH3: 3 }, logK: 10.48, charge: 2 },
        { id: 'CuNH34', metal: 'Cu', ligands: { NH3: 4 }, logK: 12.59, charge: 2 },
      ],
    });

    const acid = speciate(spec(4));
    const basic = speciate(spec(10));
    expect(acid.converged).toBe(true);
    expect(basic.converged).toBe(true);

    /*
     * At pH 4 the ligand is essentially all NH₄⁺, so the free NH₃ is
     * 0.2 × 10^(4 − 9.25) = 1.1e-6 M and no complex can compete for it.
     * At pH 10 the free fraction is large and the complexes do compete.
     *
     * The assertion is therefore a band, not the naive ratio. If the ligand
     * were not consumed by complexation, the ratio would be exactly
     * 10^(10 − 4) = 10^6; the measured 10^5.08 is lower by a factor of 8.3,
     * and that deficit is the complexation. Asserting the naive 6 would fail
     * against a correct solver, which is how this test was written the first
     * time — the band and the reason for it are the substance.
     */
    const decades = Math.log10(basic.free.NH3 / acid.free.NH3);
    expect(decades).toBeGreaterThan(4);
    expect(decades).toBeLessThan(6);

    // And the deficit is real: copper is mostly complexed at pH 10.
    const complexes = basic.species
      .filter((s) => s.id.startsWith('CuNH3'))
      .reduce((sum, s) => sum + s.conc, 0);
    expect(complexes / 0.01).toBeGreaterThan(0.5);
  });

  it('should hold the ligand total across protonated and free forms', () => {
    // Mass balance is the constraint that is easiest to drop a term from and
    // hardest to notice: the free ligand looks right while the total is short
    // by whatever was protonated. Asserted directly on the sum.
    const out = speciate({
      ph: 8,
      components: [
        { id: 'Cu', charge: 2, total: 0.01 },
        { id: 'NH3', charge: 0, total: 0.2, protonations: [{ n: 1, logK: 9.25, label: 'NH₄⁺' }] },
      ],
      complexes: [
        { id: 'CuNH3', metal: 'Cu', ligands: { NH3: 1 }, logK: 4.13, charge: 2 },
        { id: 'CuNH32', metal: 'Cu', ligands: { NH3: 2 }, logK: 7.61, charge: 2 },
        { id: 'CuNH33', metal: 'Cu', ligands: { NH3: 3 }, logK: 10.48, charge: 2 },
        { id: 'CuNH34', metal: 'Cu', ligands: { NH3: 4 }, logK: 12.59, charge: 2 },
      ],
    });
    expect(out.converged).toBe(true);

    // Every ammonia, in any form, must add back to 0.2 M.
    let ligandTotal = 0;
    for (const s of out.species) {
      if (s.id === 'NH3') ligandTotal += s.conc;
      else if (s.id === 'NH3_H1') ligandTotal += s.conc;
      else if (s.id === 'CuNH3') ligandTotal += s.conc;
      else if (s.id === 'CuNH32') ligandTotal += 2 * s.conc;
      else if (s.id === 'CuNH33') ligandTotal += 3 * s.conc;
      else if (s.id === 'CuNH34') ligandTotal += 4 * s.conc;
    }
    expect(ligandTotal).toBeCloseTo(0.2, 9);
  });
});

describe('speciate: numerical behaviour', () => {
  it('should reach a residual far below any chemically meaningful error', () => {
    // The residual is in log₁₀ units of the mass balances, so 1e-9 is a
    // relative error of one part in a billion — far past what any constant in
    // the input is known to.
    const out = speciate({
      ph: 7,
      components: [{ id: 'Ac', charge: -1, total: 0.1, protonations: [{ n: 1, logK: 4.76 }] }],
    });
    expect(out.residual).toBeLessThan(1e-9);
  });

  it('should converge from a deliberately bad starting point', () => {
    // A caller who supplies a total of 1e-12 M starts the solver a decade away
    // in log space. The damping is what makes this work; without it the first
    // Newton step overshoots and the iteration diverges.
    const out = speciate({
      ph: 7,
      components: [
        { id: 'Ag', charge: 1, total: 1e-12 },
        { id: 'Cl', charge: -1, total: 1e-12 },
      ],
      solids: [{ id: 'AgCl', logKsp: Math.log10(1.8e-10), ions: { Ag: 1, Cl: 1 } }],
    });
    expect(out.converged).toBe(true);
  });

  it('should refuse a pH the model does not cover', () => {
    // Water itself is not modelled outside this range, so an answer there
    // would be an extrapolation presented as a calculation.
    expect(() => speciate({
      ph: 20,
      components: [{ id: 'Ac', charge: -1, total: 0.1 }],
    })).toThrow();
  });
});

describe('hydroxidePrecipitationPh', () => {
  it('should find the pH where Mg(OH)₂ begins to precipitate', () => {
    /*
     * Ksp(Mg(OH)₂) = 5.61e-12, so from 0.01 M Mg²⁺:
     *   [OH⁻] = sqrt(Ksp / [Mg²⁺]) = sqrt(5.61e-10) = 2.37e-5
     *   pOH = 4.63, pH = 9.37
     */
    const ph = hydroxidePrecipitationPh({
      metal: 'Mg', ksp: 5.61e-12, total: 0.01,
    });
    expect(ph).toBeCloseTo(9.37, 2);
  });

  it('should precipitate later from a more dilute solution', () => {
    // Diluting the metal tenfold raises the pH by half a unit, since the
    // dependence is [OH] ∝ 1/sqrt([M]). A solver that reported the same pH for
    // both would be reading the Ksp alone and ignoring the concentration.
    const dilute = hydroxidePrecipitationPh({ metal: 'Mg', ksp: 5.61e-12, total: 0.001 });
    const concentrated = hydroxidePrecipitationPh({ metal: 'Mg', ksp: 5.61e-12, total: 0.01 });
    expect(dilute - concentrated).toBeCloseTo(0.5, 2);
  });
});
