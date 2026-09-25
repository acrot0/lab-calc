import { fail, requirePositive, requireNonNegative } from './errors.mjs';
import { ISOTOPES, expandShorthand } from './shorthand.mjs';
import { ELEMENTS } from './elements.mjs';

/**
 * Solution chemistry — molar mass, mass-to-weigh, dilution.
 *
 * Pure functions, no I/O. The UI layer handles storage and rendering; keeping
 * the arithmetic separate is what makes it testable against hand-computed
 * reference values.
 *
 * Every rejection here is deliberate. A calculator that returns a plausible
 * number for an impossible input is worse than one that refuses: a chemist
 * pipetting 10x too much of something is not a rounding error.
 */

/**
 * Standard atomic weights, g/mol, for all 118 elements.
 *
 * Derived from the element table rather than written out again. This table
 * previously listed 83 elements by hand, which meant every formula containing
 * one of the other 35 — UF6, PuO2, Ac2O3, TcO4- — was rejected as an unknown
 * element even though the periodic table in the same app showed them. Two
 * tables for one fact is what let them drift.
 *
 * The element table is the source: it carries the IUPAC 2021 values for the
 * elements that have them and fills the rest from the MIT-licensed data set
 * (see elements.mjs and NOTICE.md). Deriving here keeps one answer.
 */
export const ATOMIC_WEIGHTS = Object.fromEntries(
  ELEMENTS.map((e) => [e.symbol, e.mass]),
);

/**
 * Parse a chemical formula into element counts.
 *
 * Supports subscripts, nested parentheses, and the hydrate dot:
 *   H2O, Ca(OH)2, Al2(SO4)3, CuSO4·5H2O
 *
 * Throws on anything it cannot account for. An unknown element must NOT be
 * skipped — skipping yields a molar mass that looks right and is wrong, and
 * the user has no way to notice.
 */
export function parseFormula(formula) {
  if (typeof formula !== 'string' || formula.trim().length === 0) {
    fail('formulaEmpty');
  }

  // Shorthand is rewritten to plain element notation before anything else, so
  // the counting below never has to know that `Me` or `DMSO` exist.
  const { formula: expanded, applied, deuterated } = expandShorthand(formula.trim());
  const src = expanded;

  if (/^\d/.test(src)) {
    fail('formulaStartsWithDigit', { formula: src });
  }

  // Counts are accumulated per segment; a hydrate dot starts a new segment
  // whose leading coefficient multiplies the whole segment.
  const totals = new Map();
  const rawSegments = src.split(/[·.]/);
  // An empty segment means the input was malformed — `CuSO4·`, `.5H2O`, or a
  // doubled dot. Dropping those silently (as this once did) turns `NaCl.` into
  // a valid formula and `H2O·` into plain water, so a typo reads as a result.
  if (rawSegments.some((s) => s.trim().length === 0)) {
    fail('malformedFormula', { formula: src });
  }

  for (const segment of rawSegments) {
    const mult = (() => {
      const m = /^(\d+)/.exec(segment);
      return m ? Number(m[1]) : 1;
    })();
    const body = segment.replace(/^\d+/, '');
    const counts = parseSegment(body, src);
    for (const [el, n] of counts) {
      totals.set(el, (totals.get(el) ?? 0) + n * mult);
    }
  }

  // A deuterium label (`DMSO-d6`) says how many hydrogens are the heavy
  // isotope. Applied after counting, because the count is what says whether
  // there are that many hydrogens to replace.
  if (deuterated > 0) {
    const hydrogens = totals.get('H') ?? 0;
    if (deuterated > hydrogens) {
      fail('tooManyDeuteriums', { formula, asked: deuterated, available: hydrogens });
    }
    if (deuterated === hydrogens) totals.delete('H');
    else totals.set('H', hydrogens - deuterated);
    totals.set('D', deuterated);
  }

  const result = [...totals.entries()].map(([element, count]) => ({ element, count }));
  // Attached so a caller can show which abbreviations were expanded rather
  // than presenting a rewritten formula as if the user had typed it.
  if (applied.length > 0) {
    Object.defineProperty(result, 'expandedFrom', { value: applied, enumerable: false });
  }
  return result;
}

/**
 * Read the digits at `start`, requiring at least one.
 *
 * A subscript of zero is not a smaller quantity, it is an absent one: `Na0Cl`
 * would otherwise contribute no sodium and quietly return the mass of chlorine,
 * and `H0` would return zero. Both read as answers. Rejecting them is the same
 * rule the rest of this module follows.
 */
function readCount(body, start, whole) {
  let j = start;
  while (j < body.length && /\d/.test(body[j])) j++;
  if (j === start) return { count: 1, next: start };
  const count = Number(body.slice(start, j));
  if (count === 0) fail('zeroSubscript', { formula: whole });
  return { count, next: j };
}

/** Parse one segment (no hydrate dot) into element counts. */
function parseSegment(body, whole) {
  const out = new Map();
  const stack = [out];
  // Depth tracks whether anything was written into the current group, so an
  // empty `()` is rejected instead of contributing nothing.
  const wrote = [false];

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (ch === '(') {
      stack.push(new Map());
      wrote.push(false);
      continue;
    }

    if (ch === ')') {
      if (stack.length === 1) fail('unbalancedParens', { formula: whole });
      const inner = stack.pop();
      const hadContent = wrote.pop();
      if (!hadContent) fail('emptyGroup', { formula: whole });
      i++;
      const { count: mult, next } = readCount(body, i, whole);
      i = next - 1;
      const parent = stack[stack.length - 1];
      for (const [el, n] of inner) parent.set(el, (parent.get(el) ?? 0) + n * mult);
      wrote[wrote.length - 1] = true;
      continue;
    }

    if (/[A-Z]/.test(ch)) {
      let sym = ch;
      if (i + 1 < body.length && /[a-z]/.test(body[i + 1])) {
        sym += body[i + 1];
        i++;
      }
      // Isotope symbols are hydrogen, and are only recognised as formula
      // notation — they are deliberately not elements (see shorthand.mjs).
      if (!(sym in ATOMIC_WEIGHTS) && !(sym in ISOTOPES)) {
        fail('unknownElement', { element: sym, formula: whole });
      }
      const { count, next } = readCount(body, i + 1, whole);
      i = next - 1;
      const cur = stack[stack.length - 1];
      cur.set(sym, (cur.get(sym) ?? 0) + count);
      wrote[wrote.length - 1] = true;
      continue;
    }

    fail('unexpectedChar', { char: ch, formula: whole });
  }

  if (stack.length !== 1) fail('unbalancedParens', { formula: whole });
  if (!wrote[0]) fail('malformedFormula', { formula: whole });
  return out;
}

/** Molar mass in g/mol. */
/**
 * Atomic mass of a symbol as it appears in a formula.
 *
 * Isotopes are looked up first: `D` is hydrogen, but it is the 2.0141 nuclide,
 * not the 1.008 average. Falling through to ATOMIC_WEIGHTS for them would give
 * `undefined` and turn the whole molar mass into NaN.
 */
export function atomicMassOf(element) {
  if (element in ISOTOPES) return ISOTOPES[element].mass;
  const mass = ATOMIC_WEIGHTS[element];
  if (mass === undefined) fail('unknownElement', { element });
  return mass;
}

export function molarMass(formula) {
  return parseFormula(formula).reduce(
    (sum, { element, count }) => sum + atomicMassOf(element) * count,
    0,
  );
}

/**
 * The molar mass calculation, term by term.
 *
 * A molar mass is the one number in this app a student is most often asked to
 * show the working for, and it is the easiest to get wrong by dropping a
 * subscript — CO₂ read as CO gives 28 instead of 44. Listing each element's
 * contribution makes that visible: the terms are right there, and one of them
 * will be missing.
 *
 * Returns the terms rather than a formatted string, so the caller decides how
 * to present them and the translation layer stays in the UI where it belongs.
 * `contribution` is the element's total, not its atomic mass — the two differ
 * whenever the subscript is not 1, which is exactly the case worth showing.
 */
export function molarMassBreakdown(formula) {
  const parts = parseFormula(formula);
  const terms = parts.map(({ element, count }) => {
    const atomic = atomicMassOf(element);
    return {
      element,
      count,
      atomic,
      // For a subscript of 1 the multiplication is noise; the UI can drop it
      // and show the atomic mass alone.
      contribution: atomic * count,
    };
  });
  const total = terms.reduce((sum, t) => sum + t.contribution, 0);
  return { terms, total };
}

/**
 * Mass to weigh out to reach a target molarity in a given volume.
 *
 *   m = C × V(L) × M
 */
export function massForMolarity({ formula, molarity, volumeMl }) {
  const M = molarMass(formula);
  requireNonNegative(molarity, 'molarity');
  requirePositive(volumeMl, 'volume');
  const massG = molarity * (volumeMl / 1000) * M;
  return { massG, molarMass: M, moles: molarity * (volumeMl / 1000) };
}

/**
 * Dilute a stock to a target concentration.  C1V1 = C2V2
 *
 * Refuses to dilute "up": a target more concentrated than the stock is
 * impossible by dilution alone, and returning a number for it would have the
 * user pipette something that cannot work.
 */
export function dilution({ stockConc, targetConc, targetVolumeMl }) {
  requirePositive(stockConc, 'stockConc');
  requireNonNegative(targetConc, 'targetConc');
  requirePositive(targetVolumeMl, 'targetVolumeMl');
  if (targetConc > stockConc) {
    fail('diluteUp', { target: targetConc, stock: stockConc });
  }
  const stockVolumeMl = (targetConc * targetVolumeMl) / stockConc;
  return {
    stockVolumeMl,
    diluentVolumeMl: targetVolumeMl - stockVolumeMl,
    foldDilution: targetConc === 0 ? null : stockConc / targetConc,
  };
}

/** Prepare a stock solution from a solid: how much to weigh, and to what volume. */
export function stockFromSolid({ formula, molarity, volumeMl }) {
  const { massG, molarMass: M, moles } = massForMolarity({ formula, molarity, volumeMl });
  return { massG, molarMass: M, moles, finalVolumeMl: volumeMl };
}

/**
 * Serialize a calculation for the history log.
 *
 * The record is copied, never mutated — the caller's object may still be bound
 * to a form, and a stray `at` field appearing in it would be a surprise.
 */
export function serializeRecord(record, now = new Date()) {
  return JSON.stringify({ ...record, at: now.toISOString() });
}

const KIND_LABELS = {
  massForMolarity: '称量配制',
  stockFromSolid: '称量配制',
  dilution: '稀释',
  dilutionSeries: '梯度稀释',
  bufferRecipe: '缓冲液',
};

const fmt = (n, digits = 2) => (typeof n === 'number' ? n.toFixed(digits) : '?');

/**
 * One-line summary for the history list.
 *
 * Deliberately tolerant: an unrecognised record renders as its kind rather
 * than throwing. A history list that crashes on one bad row loses all of them.
 */
export function summarizeRecord(record) {
  const kind = record?.kind ?? 'unknown';
  const i = record?.inputs ?? {};
  const o = record?.outputs ?? {};
  switch (kind) {
    case 'massForMolarity':
    case 'stockFromSolid':
      return `称取 ${fmt(o.massG)} g ${i.formula}，定容至 ${i.volumeMl} mL（${i.molarity} mol/L）`;
    case 'dilution':
      return `取 ${fmt(o.stockVolumeMl)} mL 母液 + ${fmt(o.diluentVolumeMl)} mL 溶剂（${i.stockConc} → ${i.targetConc}）`;
    case 'dilutionSeries':
      return `${i.steps} 级 ${i.factor}× 梯度稀释（母液 ${i.stockConc}，每管 ${i.stepVolumeMl} mL）`;
    case 'bufferRecipe':
      return `缓冲液 pH ${i.targetPh}（pKa ${i.pKa}）`;
    case 'phCalc':
      return `${i.kind === 'acid' ? '弱酸' : '弱碱'} pK ${i.pk}、${i.conc} mol/L`;
    case 'titrationCurve':
      return `滴定曲线 弱酸 pKa ${i.pKa}、${i.conc} mol/L ${i.volumeMl} mL`;
    case 'percentSolution':
      return o.massG != null
        ? `配制 ${i.percent}% (w/v) ${i.formula} ${i.volumeMl} mL`
        : `${i.molarity} mol/L ${i.formula} 换算百分比`;
    default:
      return `${KIND_LABELS[kind] ?? kind}`;
  }
}
