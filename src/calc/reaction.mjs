import { fail, requirePositive } from './errors.mjs';
import { ATOMIC_WEIGHTS, parseFormula, molarMass } from './solution.mjs';

/**
 * Reaction stoichiometry — balancing, limiting reagent, empirical formula.
 *
 * Pure functions, no I/O. Balancing is exact integer arithmetic on a rational
 * null space, not a least-squares fit: a fit returns coefficients like 3.99998
 * that round to something plausible and wrong, and the whole point of a
 * balancer is that the atoms come out even.
 */

const ARROW = /\s*(?:->|→|=>|=)\s*/;

/**
 * Split an equation into its species.
 *
 * A leading coefficient the user typed is discarded, not honoured: the input
 * is a description of the reaction, and the output is the balanced version of
 * it. Keeping the user's coefficients would mean two sources of truth.
 */
export function parseEquation(equation) {
  if (typeof equation !== 'string' || equation.trim().length === 0) {
    fail('equationMalformed', { equation: '' });
  }
  const src = equation.trim();
  const parts = src.split(ARROW);
  if (parts.length !== 2) fail('equationMalformed', { equation: src });

  const side = (text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) fail('equationMalformed', { equation: src });
    const tokens = trimmed.split('+').map((s) => s.trim());
    // An empty token means the user wrote "Fe2+ + e-" or a dangling plus.
    // Dropping it would balance an equation they did not write.
    if (tokens.some((s) => s.length === 0)) fail('equationMalformed', { equation: src });
    return tokens.map((s) => s.replace(/^\d+/, ''));
  };

  return { reactants: side(parts[0]), products: side(parts[1]) };
}

/** Greatest common divisor, for reducing the null-space vector. */
function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

/** Exact fraction. Balancing needs ratios, and floats lose them. */
const fr = (num, den = 1) => {
  if (den === 0) throw new Error('divide by zero');
  const sign = den < 0 ? -1 : 1;
  const g = gcd(num, den) || 1;
  return { n: (sign * num) / g, d: (sign * den) / g };
};

const sub = (a, b) => fr(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => fr(a.n * b.n, a.d * b.d);
const div = (a, b) => {
  if (b.n === 0) throw new Error('divide by zero');
  return fr(a.n * b.d, a.d * b.n);
};
const absF = (a) => fr(Math.abs(a.n), a.d);

/**
 * Solve A·x = 0 for the smallest positive integer x.
 *
 * Gaussian elimination to reduced row echelon form, then read the null space
 * off the free columns. Only one free column can be non-zero, because the
 * conservation matrix of a real equation has rank = (number of species − 1);
 * when it does not, the equation has no unique balance and we refuse it.
 */
function nullSpace(matrix, cols) {
  const rows = matrix.length;
  const m = matrix.map((row) => row.map((v) => fr(v)));
  const pivotOf = new Array(cols).fill(-1);
  let r = 0;

  for (let c = 0; c < cols && r < rows; c++) {
    let pivot = -1;
    for (let i = r; i < rows; i++) {
      if (m[i][c].n !== 0) { pivot = i; break; }
    }
    if (pivot === -1) continue;
    [m[r], m[pivot]] = [m[pivot], m[r]];

    const pv = m[r][c];
    for (let j = 0; j < cols; j++) m[r][j] = div(m[r][j], pv);
    for (let i = 0; i < rows; i++) {
      if (i === r || m[i][c].n === 0) continue;
      const f = m[i][c];
      for (let j = 0; j < cols; j++) m[i][j] = sub(m[i][j], mul(f, m[r][j]));
    }
    pivotOf[c] = r;
    r++;
  }

  const free = [];
  for (let c = 0; c < cols; c++) if (pivotOf[c] === -1) free.push(c);
  if (free.length !== 1) return null;

  const f = free[0];
  const x = new Array(cols).fill(fr(0));
  x[f] = fr(1);
  for (let c = 0; c < cols; c++) {
    if (pivotOf[c] === -1) continue;
    x[c] = fr(-m[pivotOf[c]][f].n, m[pivotOf[c]][f].d);
  }

  // Scale to the smallest positive integers: clear the denominators, flip the
  // sign if the free variable came out negative, then divide out the gcd.
  const denLcm = x.reduce((acc, v) => (v.n === 0 ? acc : (acc * v.d) / gcd(acc, v.d)), 1);
  let ints = x.map((v) => (v.n * denLcm) / v.d);
  const sign = ints.find((v) => v !== 0);
  if (sign < 0) ints = ints.map((v) => -v);
  const g = ints.reduce((acc, v) => (v === 0 ? acc : gcd(acc, v)), 0) || 1;
  return ints.map((v) => v / g);
}

export function balanceEquation({ equation }) {
  const { reactants, products } = parseEquation(equation);
  const species = [...reactants, ...products];

  // Element counts per species. Reactants positive, products negative, so a
  // balanced equation is exactly "this weighted sum is zero".
  const counts = species.map((f) => {
    const parsed = parseFormula(f);
    const map = new Map();
    for (const { element, count } of parsed) map.set(element, count);
    return map;
  });

  const elements = [...new Set(counts.flatMap((m) => [...m.keys()]))];
  if (elements.length === 0) fail('equationMalformed', { equation });

  const matrix = elements.map((el) => species.map((f, idx) => {
    const c = counts[idx].get(el) ?? 0;
    return idx < reactants.length ? c : -c;
  }));

  const ints = nullSpace(matrix, species.length);
  if (!ints || ints.some((v) => v <= 0)) fail('cannotBalance', { equation });

  const wrap = (formulas, offset) => formulas.map((formula, i) => ({
    formula,
    coefficient: ints[offset + i],
  }));

  // Per-element atom counts on each side. The coefficients above are only
  // credible if this table balances, so it is computed here rather than
  // re-derived by every caller that wants to show its work.
  const balanced = elements.map((el) => ({
    element: el,
    left: species.reduce((sum, f, idx) => (
      idx < reactants.length ? sum + (counts[idx].get(el) ?? 0) * ints[idx] : sum
    ), 0),
    right: species.reduce((sum, f, idx) => (
      idx >= reactants.length ? sum + (counts[idx].get(el) ?? 0) * ints[idx] : sum
    ), 0),
  }));

  return {
    reactants: wrap(reactants, 0),
    products: wrap(products, reactants.length),
    balanced,
    equation: [
      wrap(reactants, 0).map((s) => `${s.coefficient === 1 ? '' : s.coefficient}${s.formula}`).join(' + '),
      wrap(products, reactants.length).map((s) => `${s.coefficient === 1 ? '' : s.coefficient}${s.formula}`).join(' + '),
    ].join(' -> '),
  };
}

/** Mass percent of each element in a formula. */
export function percentComposition({ formula }) {
  const parsed = parseFormula(formula);
  const M = parsed.reduce((s, { element, count }) => s + ATOMIC_WEIGHTS[element] * count, 0);
  return parsed.map(({ element, count }) => {
    const mass = ATOMIC_WEIGHTS[element] * count;
    return {
      element,
      count,
      massG: mass,
      massPercent: (mass / M) * 100,
    };
  });
}

/**
 * Empirical formula from mass data, and the molecular formula when a molar
 * mass is supplied.
 *
 * The amounts may be grams or percents — only the ratio between them matters,
 * so the same routine answers both questions.
 */
export function empiricalFormula({ entries, molarMassGmol }) {
  if (!Array.isArray(entries) || entries.length === 0) fail('componentsEmpty');
  for (const e of entries) {
    if (!(e.element in ATOMIC_WEIGHTS)) fail('unknownElement', { element: e.element });
    requirePositive(e.amount, e.element);
  }

  const moles = entries.map((e) => ({ element: e.element, mol: e.amount / ATOMIC_WEIGHTS[e.element] }));
  const min = Math.min(...moles.map((m) => m.mol));
  const ratios = moles.map((m) => ({ element: m.element, ratio: m.mol / min }));

  // Round the ratios to the nearest small integer. A ratio of 2.99 is 3; the
  // tolerance has to be generous because the input percents are themselves
  // rounded, but not so generous that 1.5 rounds to 2.
  const scale = ratios.map((r) => {
    for (let k = 1; k <= 12; k++) {
      if (Math.abs(r.ratio * k - Math.round(r.ratio * k)) < 0.08) {
        return { ...r, k, rounded: Math.round(r.ratio * k) };
      }
    }
    return { ...r, k: 1, rounded: Math.round(r.ratio) };
  });
  const mult = scale.reduce((acc, r) => (acc * r.k) / gcd(acc, r.k), 1);
  const subscripts = scale.map((r) => ({ element: r.element, count: r.rounded * (mult / r.k) }));
  const g = subscripts.reduce((acc, s) => gcd(acc, s.count), 0) || 1;

  const format = (parts) => parts.map(({ element, count }) => `${element}${count === 1 ? '' : count}`).join('');
  const empirical = format(subscripts.map((s) => ({ ...s, count: s.count / g })));
  const empiricalMass = subscripts.reduce((s, x) => s + (ATOMIC_WEIGHTS[x.element] * x.count) / g, 0);

  const out = { formula: empirical, empiricalFormula: empirical, molarMass: empiricalMass, ratios };

  if (molarMassGmol !== undefined && molarMassGmol !== null) {
    requirePositive(molarMassGmol, 'molarMass');
    const n = Math.round(molarMassGmol / empiricalMass);
    if (n < 1) fail('molarMassTooSmall', { molarMass: molarMassGmol, empirical: empiricalMass });
    out.multiplier = n;
    out.molecularFormula = format(subscripts.map((s) => ({ ...s, count: (s.count / g) * n })));
    out.formula = out.molecularFormula;
    out.molecularMass = empiricalMass * n;
  }

  return out;
}

const UNITS = { g: 'mass', mg: 'mass', kg: 'mass', mol: 'moles', mmol: 'moles' };
const TO_MOLES = { mol: 1, mmol: 1e-3 };

/**
 * Limiting reagent, theoretical yield, and leftover excess.
 *
 * `extent` is the reaction extent ξ: moles of reaction that actually occur.
 * Every other quantity follows from it, which is why it is the single value
 * the whole calculation is built on.
 */
export function limitingReagent({ equation, amounts, yieldOf, actualG }) {
  const { reactants, products } = parseEquation(equation);
  if (!Array.isArray(amounts) || amounts.length === 0) fail('componentsEmpty');

  const balanced = balanceEquation({ equation });
  const coeffOf = new Map(balanced.reactants.map((s) => [s.formula, s.coefficient]));

  const supplied = new Map();
  for (const a of amounts) {
    if (!coeffOf.has(a.formula)) fail('notAReactant', { formula: a.formula });
    if (!(a.unit in UNITS)) fail('unknownUnit', { unit: a.unit });
    requirePositive(a.amount, a.formula);
    const moles = UNITS[a.unit] === 'moles' ? a.amount * TO_MOLES[a.unit] : a.amount / molarMass(a.formula);
    supplied.set(a.formula, moles);
  }
  for (const r of reactants) {
    if (!supplied.has(r)) fail('amountMissing', { formula: r });
  }

  const extents = balanced.reactants.map((s) => ({
    formula: s.formula,
    coefficient: s.coefficient,
    extent: supplied.get(s.formula) / s.coefficient,
  }));
  const winner = extents.reduce((a, b) => (b.extent < a.extent ? b : a));
  const extent = winner.extent;

  const excess = extents
    .filter((e) => e.formula !== winner.formula)
    .map((e) => {
      const c = coeffOf.get(e.formula);
      const molesLeft = supplied.get(e.formula) - c * extent;
      return {
        formula: e.formula,
        molesLeft,
        massG: molesLeft * molarMass(e.formula),
      };
    })
    // A tie leaves a rounding crumb behind; reporting "0.0000001 g left" is
    // noise, not information.
    .filter((e) => e.molesLeft > 1e-9);

  const productRows = balanced.products.map((s) => ({
    formula: s.formula,
    coefficient: s.coefficient,
    molarMass: molarMass(s.formula),
    moles: s.coefficient * extent,
    massG: s.coefficient * extent * molarMass(s.formula),
  }));

  const out = {
    limiting: winner.formula,
    extent,
    reactants: extents,
    excess,
    products: productRows,
  };

  if (yieldOf !== undefined && yieldOf !== null) {
    const row = productRows.find((p) => p.formula === yieldOf);
    if (!row) fail('notAProduct', { formula: yieldOf });
    requirePositive(actualG, 'actual');
    out.percentYield = (actualG / row.massG) * 100;
  }

  return out;
}
