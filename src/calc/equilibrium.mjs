/**
 * General multi-equilibrium speciation: solubility products and stepwise
 * complexation, solved together with the acid-base equilibria they compete
 * with.
 *
 * ## Why this module exists
 *
 * Every other calculation in this app answers its question with a closed form.
 * Solubility and complexation do not have one. Dissolving AgCl in ammonia, or
 * a metal in the presence of a ligand that is itself a base, couples the
 * solubility to the pH and the pH to the ligand's own protonation: the free
 * ligand concentration depends on the pH, which depends on how much metal
 * hydrolysed, which depends on how much dissolved. Writing one formula per
 * scenario gives one formula per scenario, each assuming the others away —
 * exactly the approximation this app refuses elsewhere (see `curve.mjs` for
 * the same argument about the sqrt(Ka·C) shortcut).
 *
 * So the model is the equations themselves: mass action for every species,
 * mass balance for every component, and the solubility product for every
 * solid. That is a small dense system, which is what Newton–Raphson is
 * actually good at.
 *
 * ## The formulation, and why it balances
 *
 * Unknowns: the free concentration of each non-hydrogen component (n of them),
 * plus the amount precipitated from each solid (m of them).
 *
 * Equations: one mass balance per component (n), one solubility product per
 * solid (m).
 *
 * The counts match, which is the whole reason for carrying the precipitated
 * amount as an unknown rather than trying to eliminate it. Two tempting
 * shortcuts do not balance: replacing a solid's mass balance with its Ksp
 * leaves the system under-determined for a sparingly soluble salt in pure
 * water (two unknowns, one equation), and adding a charge-balance equation on
 * top over-determines it for a solid whose anion concentration is already
 * pinned by a fixed pH. Charge balance is therefore reported as a diagnostic
 * and never enforced — a caller who fixed the pH asked "what is in solution at
 * this pH", not "what pH does this mixture reach", and those are different
 * questions with different answers.
 *
 * ## Why the unknowns are log10 concentrations
 *
 * A speciation problem spans an enormous dynamic range. A saturated AgCl
 * solution has [Ag⁺] ≈ 1.3e-5 M; add 1 M ammonia and the free [Ag⁺] falls
 * below 1e-9 M while the diammine complex is 1e-2. Iterating on concentrations
 * makes the Jacobian columns for those species differ by seven orders of
 * magnitude, and the linear solve loses the small one to rounding.
 *
 * Iterating on pX = −log₁₀[X] puts every component on one scale, so a Newton
 * step of 0.1 means the same relative change for all of them. It also makes
 * non-negativity structural: any finite pX is a positive concentration, so the
 * solver cannot wander into a negative concentration and take a fractional
 * power of it. PHREEQC, Visual MINTEQ and CurTiPot all formulate it this way.
 *
 * ## What this model does not claim
 *
 * Activity coefficients are absent: the constants are concentration constants,
 * and the caller is told when the ionic strength puts the solution outside the
 * range where that holds. Metal hydrolysis, mixed-ligand complexes, and ion
 * pairs beyond those the caller lists are absent. Each omission makes the
 * model predict *more* dissolved than reality, which is the direction that
 * matters — the answer is an upper bound on what will dissolve, never a
 * falsely optimistic one about what will precipitate.
 *
 * Pure functions, no I/O — errors are codes (see errors.mjs).
 */

import { fail, requireFinite, requirePositive } from './errors.mjs';

const KW = 1e-14;

/**
 * Iteration limits.
 *
 * The Newton loop is capped because each step is cheap and the system is
 * smooth; a solve that has not converged in 200 steps is not converging, and
 * continuing would only make the eventual wrong answer slower to arrive. The
 * damping loop is separate and much smaller — see `newton` for why a step that
 * does not reduce the residual is halved rather than accepted.
 */
const MAX_ITER = 200;
const MAX_DAMPING = 40;
const TOL = 1e-11;

/**
 * The master components and every species they form.
 *
 * Each species carries its composition — how many of each component and how
 * many protons it contains — which is all the solver needs. Its concentration
 * is then fixed by mass action at the current free concentrations, so it never
 * becomes a separate unknown.
 */
function buildSystem({ components, complexes }) {
  const masters = components.map((c) => c.id);
  const species = [];

  /*
   * Water is not a species here. H⁺ is not an unknown (the pH is an input), so
   * it appears only as a term in other species' compositions; OH⁻ is written
   * as the dissociation of water, composition { H: −1 } with log K = log Kw,
   * which makes log[OH⁻] = log Kw + pH as it must be.
   */
  species.push({ id: 'OH', composition: { H: -1 }, logK: -14, charge: -1, label: 'OH⁻' });

  for (const c of components) {
    // The free ion itself: no equilibrium to satisfy, log K = 0.
    species.push({
      id: c.id, composition: { [c.id]: 1 }, logK: 0, charge: c.charge, label: c.label ?? c.id,
    });
    for (const p of c.protonations ?? []) {
      species.push({
        id: `${c.id}_H${p.n}`,
        composition: { [c.id]: 1, H: p.n },
        logK: p.logK,
        charge: c.charge + p.n,
        label: p.label ?? `${c.label ?? c.id}H${p.n}`,
      });
    }
  }

  for (const cx of complexes ?? []) {
    species.push({
      id: cx.id,
      composition: { [cx.metal]: 1, ...cx.ligands },
      logK: cx.logK,
      charge: cx.charge ?? 0,
      label: cx.label ?? cx.id,
    });
  }

  return { species, masters };
}

/**
 * log₁₀ of a species' concentration at the current free concentrations.
 *
 *   log₁₀[C] = log K + Σ νᵢ · log₁₀[Xᵢ]
 *
 * and since the unknown is pX = −log₁₀[X], that is
 *
 *   log₁₀[C] = log K − Σ νᵢ · pXᵢ
 *
 * The minus is right for every component, hydrogen included. Hydrogen has no
 * entry in `px` — the pH is an input, not an unknown — so it is read from
 * `pH` separately, but it enters with the same sign: a species containing one
 * proton has concentration proportional to [H⁺] = 10^(−pH), so its log falls
 * as the pH rises. Substituting ν_H = 1 into the expression above gives
 * log C = log K − pH, which is what the equilibrium H⁺ + A⁻ ⇌ HA asks for
 * (log K = pKa for that reaction written in the association direction).
 *
 * Getting this sign backwards still converges, to a model in which raising the
 * pH protonates an acid. It is worth stating plainly because the pKa assertion
 * in the tests does NOT catch it on its own: [Ac⁻]/[HA] is a ratio of two
 * species carrying the same component, so a shared error cancels. What catches
 * it is a species' concentration against an independently known value — the
 * free-ligand test, or the Ksp test, where the ion product is compared with the
 * constant rather than with another computed number.
 */
function speciesLogC(sp, px) {
  let logC = sp.logK;
  for (const [id, nu] of Object.entries(sp.composition)) {
    const p = id === 'H' ? px.H : px[id];
    if (p === undefined) fail('equilibriumUnknownComponent', { species: sp.id, component: id });
    logC -= nu * p;
  }
  return logC;
}

/**
 * Residuals and Jacobian at a trial point.
 *
 * Each mass balance is written as a *relative* residual,
 *
 *   r = (Σ νᵢ[Cᵢ] − added) / added
 *
 * rather than as a difference or as a log ratio. A difference asks for one
 * absolute tolerance on quantities that may be 1e-12 M in one equation and 1 M
 * in another, so no single tolerance serves both. A log ratio cannot represent
 * the target at all here, because the target moves with the precipitated
 * amount and reaches zero when everything has come out of solution — and
 * log(0) is not a residual, it is the end of the iteration. The relative form
 * is dimensionless, is meaningful at every scale, and stays finite at zero.
 *
 * ## Why the solid unknown is a fraction rather than an amount
 *
 * The dissolution unknown is the *fraction* of the limiting ion that has come
 * out of solution, in [0, 1], not the amount in mol/L. Both describe the same
 * state, but the Jacobian columns differ by five orders of magnitude: for a
 * 1e-5 M silver solution the amount's derivative is 1e5 while the pX columns
 * are O(0.1), and a Newton step computed from that matrix moves the amount by
 * far more than its own value. The step is then rejected by the non-negativity
 * guard at every damping scale and the iteration stalls — which is exactly what
 * happened, reported as "converged: false" on a system whose Ksp row was
 * already satisfied to twelve digits.
 *
 * Scaling the unknown to its own range is the ordinary fix for an
 * ill-conditioned Jacobian, and it is not cosmetic: the fraction form
 * converges from the same starting point in six steps.
 */
function evaluate({ sys, px, added, solids, fractions, limits }) {
  const logC = new Map();
  for (const sp of sys.species) logC.set(sp.id, speciesLogC(sp, px));

  /*
   * No residual may be infinite or NaN, and returning one would be worse than
   * failing: `Math.hypot` propagates a NaN, every comparison against NaN is
   * false, and the damping loop reads "no step reduced the residual" as a
   * stall — reporting a solve that never started as one that converged. This
   * was measured, not imagined: with `precipitated` at zero the first trial
   * put 0.01 mol into a solid while `added` was 1e-5, the mass balance target
   * went negative, and `Math.log10` of it produced NaN, which the iteration
   * then accepted as a reduction.
   *
   * The guard is on the output rather than on the input because the caller
   * cannot be expected to know which trial points are physical, and the
   * damping loop already has a mechanism for rejecting a step — it just needs
   * a finite number to compare.
   */
  const bad = (v) => !Number.isFinite(v);
  const pen = (v) => (bad(v) ? 1e12 : v);

  const r = [];
  const jac = [];

  for (const id of sys.masters) {
    let sum = 0;
    const dSum = new Map();
    for (const sp of sys.species) {
      const nu = sp.composition[id];
      if (!nu) continue;
      const c = 10 ** logC.get(sp.id);
      sum += nu * c;
      for (const [cid, nj] of Object.entries(sp.composition)) {
        /*
         * Hydrogen gets no column: the pH is an input, not an unknown, so its
         * derivative has nowhere to go. Every other component does get one,
         * including the diagonal — ∂C/∂pX_i is non-zero for a species that
         * contains component i, and omitting it makes the whole row zero for a
         * single-component system, which the linear solve then rejects as
         * singular. That omission was the first bug this module had.
         */
        if (cid === 'H') continue;
        // ∂C/∂pX_j = −ν_j · C · ln10
        dSum.set(cid, (dSum.get(cid) ?? 0) + nu * c * -nj * Math.LN10);
      }
    }

    /*
     * What left solution into each solid. A solid's ions must be supplied by
     * the components — see the guard below — so its contribution to this
     * component's total is its stoichiometric coefficient times the amount
     * precipitated, which is the fraction times the limiting ion's total.
     */
    let removed = 0;
    for (const s of solids) {
      const nu = s.ions[id];
      if (!nu) continue;
      removed += nu * fractions[s.id] * limits[s.id];
    }
    const target = added[id] - removed;
    const ref = added[id];

    r.push(pen((sum - target) / ref));
    /*
     * ∂r/∂fraction_s = +ν_s · limit_s / added.
     *
     * The sign is positive because a larger fraction means more has left the
     * solution, which lowers the target and *raises* the residual. Writing it
     * negative inverts the direction of every dissolution step, and the
     * iteration then walks confidently away from the answer: measured, it
     * drove a supersaturated AgCl solution to precipitate nothing at all, with
     * an ion product of 1e-6 against a Ksp of 1.8e-10.
     *
     * These columns couple the mass balances to the dissolution unknowns;
     * without them the system has more unknowns than independent directions
     * and the linear solve fails.
     */
    const row = [];
    for (const other of sys.masters) row.push(pen((dSum.get(other) ?? 0) / ref));
    for (const s of solids) row.push(pen((s.ions[id] ?? 0) * limits[s.id] / ref));
    jac.push(row);
  }

  for (const s of solids) {
    // log₁₀(IAP / Ksp): zero exactly at saturation, negative while undersaturated.
    let logIp = 0;
    for (const [cid, nu] of Object.entries(s.ions)) {
      logIp += nu * logC.get(cid);
    }
    r.push(logIp - s.logKsp);

    /*
     * ∂log(IAP)/∂pX_j for each component j. The derivative runs through every
     * *species* that carries the ion, not through the ion's free concentration
     * alone: the free ion is itself a species whose concentration depends on
     * its own pX, which is where the diagonal comes from. The precipitated
     * columns are zero — a solubility product says nothing about how much
     * solid is present.
     */
    const row = [];
    for (const id of sys.masters) {
      let d = 0;
      for (const [cid, nu] of Object.entries(s.ions)) {
        const target = sys.species.find((x) => x.id === cid);
        if (!target) continue;
        /*
         * No ln10 here, unlike the mass-balance row. That row differentiates a
         * concentration (which brings down the ln10 from d(10^x)/dx); this one
         * differentiates a log concentration, where it cancels. Carrying it
         * here scaled the whole Ksp equation by 2.303, which made the Newton
         * step overshoot in that row and stall the iteration — the third bug
         * in this module, and the one that looked like a convergence problem
         * rather than an algebra problem.
         */
        d += nu * -(target.composition[id] ?? 0);
      }
      row.push(pen(d));
    }
    for (let k = 0; k < solids.length; k++) row.push(0);
    jac.push(row);
  }

  return { r, jac, logC };
}

/** Dense Gaussian elimination with partial pivoting. Small systems only. */
function solveLinear(a, b) {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[piv][col])) piv = row;
    }
    if (Math.abs(m[piv][col]) < 1e-300) fail('equilibriumSingular');
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let row = col + 1; row < n; row++) {
      const f = m[row][col] / m[col][col];
      if (f === 0) continue;
      for (let k = col; k <= n; k++) m[row][k] -= f * m[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let s = m[row][n];
    for (let k = row + 1; k < n; k++) s -= m[row][k] * x[k];
    x[row] = s / m[row][row];
  }
  return x;
}

/**
 * Damped Newton–Raphson on the combined log/linear unknown vector.
 *
 * The damping is not decoration. A full Newton step can overshoot into a
 * region where a mass balance is dominated by a species that should be
 * negligible, and the residual grows instead of shrinking — the classic
 * failure that makes a solver oscillate and then report a converged wrong
 * answer. Halving the step until the residual norm falls makes the iteration
 * monotone, at the cost of a few extra residual evaluations.
 */
function newton({ sys, added, solids, initial, limits }) {
  const px = { ...initial.px, H: initial.ph };
  const fractions = { ...initial.fractions };
  let state = evaluate({ sys, px, added, solids, fractions, limits });
  let norm = Math.hypot(...state.r);

  for (let iter = 0; iter < MAX_ITER; iter++) {
    if (norm < TOL) return { px, fractions, norm, converged: true, iterations: iter };
    const step = solveLinear(state.jac, state.r.map((v) => -v));

    let accepted = false;
    let scale = 1;
    for (let d = 0; d < MAX_DAMPING; d++) {
      const trialPx = {};
      const trialFrac = {};
      let i = 0;
      for (const id of sys.masters) {
        trialPx[id] = px[id] + step[i] * scale;
        i += 1;
      }
      for (const s of solids) {
        trialFrac[s.id] = fractions[s.id] + step[i] * scale;
        i += 1;
      }

      /*
       * A negative fraction is not a physical state: it says the solid
       * dissolved more than the solution ever contained. Letting it through
       * would make the mass-balance target exceed what was added and the
       * residual meaningless. Rejecting it lets the damping shrink the step
       * instead, which is the same mechanism that handles overshoot.
       *
       * Fractions above 1 are deliberately allowed. That is the signal that
       * this solid should not be present at all, and the active-set re-solve
       * in `speciate` is what acts on it — clamping here would hide the
       * information rather than handle it.
       */
      if (solids.some((s) => trialFrac[s.id] < 0)) { scale /= 2; continue; }

      const next = evaluate({
        sys, px: { ...trialPx, H: initial.ph }, added, solids, fractions: trialFrac, limits,
      });
      const nextNorm = Math.hypot(...next.r);
      if (Number.isFinite(nextNorm) && nextNorm < norm) {
        Object.assign(px, trialPx);
        Object.assign(fractions, trialFrac);
        state = next; norm = nextNorm;
        accepted = true;
        break;
      }
      scale /= 2;
    }
    // No step anywhere in the halving sequence reduces the residual: the
    // iteration has stalled. Returning `converged: false` is the honest
    // outcome; the caller must not present a stalled solve as an answer.
    if (!accepted) return { px, fractions, norm, converged: false, iterations: iter };
  }

  return { px, fractions, norm, converged: false, iterations: MAX_ITER };
}

/**
 * Speciate a solution at a fixed pH.
 *
 * @param {number} spec.ph             Fixed pH — the model does not solve for it
 * @param {object[]} spec.components   `{ id, charge, total, protonations?, label? }`
 * @param {object[]} [spec.complexes]  `{ id, metal, ligands, logK, charge?, label? }`
 * @param {object[]} [spec.solids]     `{ id, logKsp, ions }` — ions keyed by component id
 */
export function speciate(spec) {
  requireFinite(spec?.ph, 'ph');
  const ph = spec.ph;
  if (ph < -2 || ph > 16) fail('phOutOfRange', { ph });

  const components = spec.components ?? [];
  if (components.length === 0) fail('equilibriumNoComponents');

  const sys = buildSystem({ components, complexes: spec.complexes });
  const added = {};
  const px = {};
  for (const c of components) {
    requirePositive(c.total, 'concentration');
    added[c.id] = c.total;
    /*
     * Start each free concentration a decade below its total. Once complexes
     * and protonation are counted the free ion is always the smaller part of
     * the total, so this starts on the correct side of the root without the
     * caller having to guess. The damping handles the cases where it is wrong.
     */
    px[c.id] = -Math.log10(c.total) + 1;
  }

  const solids = (spec.solids ?? []).map((s) => ({
    ...s,
    logKsp: s.logKsp ?? Math.log10(s.ksp ?? NaN),
  }));
  for (const s of solids) {
    requireFinite(s.logKsp, 'ksp');
    for (const id of Object.keys(s.ions)) {
      /*
       * A solid whose ion is not supplied by any component has no mass balance
       * to attach its dissolution to, and the system would be under-determined
       * — the solver would be free to choose any amount. Refusing is the only
       * honest response; the alternative is a number that answers a different
       * question than the one asked.
       */
      if (added[id] === undefined) {
        fail('equilibriumSolidIonMissing', { solid: s.id, component: id });
      }
    }
  }

  /*
   * How much of each solid could possibly be present: the total of its
   * scarcest ion, divided by that ion's stoichiometric coefficient. Every
   * fraction is measured against this, which is what keeps the unknown in
   * [0, 1] and the Jacobian columns on the same scale as the pX columns.
   */
  const limits = {};
  for (const s of solids) {
    limits[s.id] = Math.min(...Object.entries(s.ions).map(([id, nu]) => added[id] / nu));
  }

  /*
   * The initial fractions are strictly positive, and zero does not work.
   *
   * Zero sits on the boundary of the feasible region. For a sparingly soluble
   * salt the correct first step is to *dissolve*, so the Newton step is
   * negative, the guard rejects it, and halving keeps it negative at every
   * scale — the iteration reports `converged: false` on a problem it solves in
   * six steps from any interior point. Measured, not reasoned about: this was
   * the second bug in this module.
   */
  const startFractions = {};
  for (const s of solids) startFractions[s.id] = 0.5;

  /**
   * Solve with a given set of solids assumed present.
   *
   * ## Why this is a search over subsets
   *
   * "Which solids are present" is not a question the equations answer on their
   * own — it is a choice of which constraints apply, and the wrong choice has
   * no solution at all rather than a bad one. Assuming AgCl is present in a
   * solution that is undersaturated asks for (1e-5 − x)² = Ksp with x ≥ 0,
   * whose only root is x = −3.4e-6; the Newton iteration cannot reach it, and
   * the failure surfaces as a stall rather than as a wrong number.
   *
   * So each subset is tried and the first that converges wins. That is the
   * standard active-set treatment, and the subset count is 2^m for m solids —
   * small, because m is one or two in every system a laboratory actually has,
   * and the largest subsets are tried first so the common case costs one solve.
   * A search is honest here in a way a heuristic would not be: the answer
   * states which solids are present, and the alternative to searching is
   * guessing that and hoping.
   */
  const solveWith = (active) => {
    if (active.length === 0) {
      // Nothing precipitates: one Newton solve with no dissolution unknowns.
      const bare = newton({ sys, added, solids: [], limits: {}, initial: { ph, px, fractions: {} } });
      return bare;
    }
    const fractions = {};
    for (const s of active) fractions[s.id] = 0.5;
    return newton({ sys, added, solids: active, limits, initial: { ph, px, fractions } });
  };

  /**
   * Every non-empty subset of `solids`, largest first, then the empty set.
   *
   * The empty set is last on purpose. It always solves — with no solids there
   * are no solubility equations, and the mass balances are satisfied by the
   * totals themselves — so yielding it first would make it win every time and
   * the model would never precipitate anything. That was measured: the
   * supersaturated case returned "no solid" with an ion product of 1e-6
   * against a Ksp of 1.8e-10, which is precisely the answer the solver exists
   * to avoid giving.
   */
  function* subsets(list) {
    for (let size = list.length; size >= 1; size--) {
      const idx = [...Array(size).keys()];
      for (;;) {
        yield idx.map((i) => list[i]);
        let i = size - 1;
        while (i >= 0 && idx[i] === list.length - size + i) i--;
        if (i < 0) break;
        idx[i]++;
        for (let j = i + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
      }
    }
    yield [];
  }

  let solved = null;
  let activeSet = solids;
  for (const active of subsets(solids)) {
    const attempt = solveWith(active);
    /*
     * A converging solve also has to be physically admissible: a negative
     * fraction says more came out of solution than was ever in it, which means
     * this solid does not belong in the set however well the equations closed.
     */
    const admissible = active.every((s) => attempt.fractions[s.id] >= 0);
    if (attempt.converged && admissible) {
      solved = attempt;
      activeSet = active;
      break;
    }
    if (solved === null) { solved = attempt; activeSet = active; }
  }

  const concentrations = [];
  for (const sp of sys.species) {
    const logC = speciesLogC(sp, solved.px);
    /*
     * A species below 1e-30 M is zero for every purpose a laboratory has, and
     * printing it would imply the model resolves it. The cutoff is not a
     * tolerance on the answer: nothing above it is affected.
     */
    if (logC < -30) continue;
    concentrations.push({
      id: sp.id, label: sp.label, charge: sp.charge, logC, conc: 10 ** logC,
    });
  }
  concentrations.sort((a, b) => b.conc - a.conc);

  const present = activeSet;
  const absent = solids.filter((s) => !activeSet.includes(s));

  return {
    ph,
    converged: solved.converged,
    iterations: solved.iterations,
    residual: solved.norm,
    /*
     * The unknowns are pX = −log₁₀[X], so the concentration is 10^(−pX). The
     * minus is the whole point of the parameterisation and is easy to drop
     * when reading the vector back out: omitting it reports the reciprocal of
     * every free concentration, which is a number of the right order of
     * magnitude for a solution that is nothing like the one asked for.
     */
    free: Object.fromEntries(sys.masters.map((m) => [m, 10 ** -solved.px[m]])),
    species: concentrations,
    solids: [
      ...present.map((s) => ({
        id: s.id, present: true, precipitated: solved.fractions[s.id] * limits[s.id],
      })),
      ...absent.map((s) => ({ id: s.id, present: false, precipitated: 0 })),
    ],
    chargeBalance: chargeResidual(concentrations),
  };
}

/**
 * The charge-balance residual of a computed speciation, in mol/L.
 *
 * Reported, never enforced — see the module note for why enforcing it would
 * change the question. A large value is not a numerical failure but a signal
 * that the inputs are missing an ion: a caller who lists Ag⁺ and Cl⁻ and no
 * counter-ion has described a solution that cannot exist, and this is the
 * number that says so.
 */
function chargeResidual(species) {
  return species.reduce((sum, s) => sum + s.charge * s.conc, 0);
}

/**
 * The pH at which a metal hydroxide starts to precipitate from a given total.
 *
 * Found by bisection rather than read off the Ksp, because the answer depends
 * on the free metal concentration and that depends on every complex in
 * solution. With the default stoichiometry the relation is
 *
 *   [M]·[OH]ⁿ = Ksp,   [OH] = Kw/[H⁺]
 *
 * so the threshold moves by half a pH unit per decade of dilution — a
 * dependence a Ksp-only answer cannot express.
 *
 * @param {number} [n]  Hydroxide ions per formula unit; 2 for M(OH)₂
 * @returns {number|null}  null when the hydroxide is soluble across the range
 */
export function hydroxidePrecipitationPh({ ksp, total, n = 2, phMin = 0, phMax = 14 }) {
  requirePositive(total, 'concentration');
  requirePositive(ksp, 'ksp');
  if (!Number.isInteger(n) || n < 1) fail('mustBePositive', { name: 'n', value: n });

  // Positive once the solution is saturated: log([M][OH]ⁿ / Ksp).
  const f = (ph) => Math.log10(total) + n * (ph - 14) - Math.log10(ksp);
  if (!(f(phMin) < 0 && f(phMax) > 0)) return null;

  let lo = phMin;
  let hi = phMax;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
