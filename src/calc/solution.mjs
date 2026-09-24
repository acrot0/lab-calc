import { fail, requirePositive, requireNonNegative } from './errors.mjs';

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

/** IUPAC 2021 standard atomic weights, g/mol. */
export const ATOMIC_WEIGHTS = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011,
  N: 14.007, O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305,
  Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948,
  K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996,
  Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
  Ga: 69.723, Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798,
  Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95,
  Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82,
  Sn: 118.71, Sb: 121.76, Te: 127.60, I: 126.90, Xe: 131.29, Cs: 132.91,
  Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24, Sm: 150.36,
  Eu: 151.96, Gd: 157.25, Tb: 158.93, Dy: 162.50, Ho: 164.93, Er: 167.26,
  Tm: 168.93, Yb: 173.05, Lu: 174.97, Hf: 178.49, Ta: 180.95, W: 183.84,
  Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08, Au: 196.97, Hg: 200.59,
  Tl: 204.38, Pb: 207.2, Bi: 208.98, Th: 232.04, U: 238.03,
};

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
  const src = formula.trim();
  if (/^\d/.test(src)) {
    fail('formulaStartsWithDigit', { formula: src });
  }

  // Counts are accumulated per segment; a hydrate dot starts a new segment
  // whose leading coefficient multiplies the whole segment.
  const totals = new Map();
  const segments = src.split(/[·.]/).filter((s) => s.length > 0);

  for (const segment of segments) {
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

  return [...totals.entries()].map(([element, count]) => ({ element, count }));
}

/** Parse one segment (no hydrate dot) into element counts. */
function parseSegment(body, whole) {
  const out = new Map();
  const stack = [out];

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (ch === '(') {
      const inner = new Map();
      stack.push(inner);
      continue;
    }

    if (ch === ')') {
      if (stack.length === 1) fail('unbalancedParens', { formula: whole });
      const inner = stack.pop();
      i++;
      let numStart = i;
      while (i < body.length && /\d/.test(body[i])) i++;
      const mult = i > numStart ? Number(body.slice(numStart, i)) : 1;
      i--;
      const parent = stack[stack.length - 1];
      for (const [el, n] of inner) parent.set(el, (parent.get(el) ?? 0) + n * mult);
      continue;
    }

    if (/[A-Z]/.test(ch)) {
      let sym = ch;
      if (i + 1 < body.length && /[a-z]/.test(body[i + 1])) {
        sym += body[i + 1];
        i++;
      }
      if (!(sym in ATOMIC_WEIGHTS)) {
        fail('unknownElement', { element: sym, formula: whole });
      }
      let numStart = i + 1;
      let j = numStart;
      while (j < body.length && /\d/.test(body[j])) j++;
      const count = j > numStart ? Number(body.slice(numStart, j)) : 1;
      i = j - 1;
      const cur = stack[stack.length - 1];
      cur.set(sym, (cur.get(sym) ?? 0) + count);
      continue;
    }

    fail('unexpectedChar', { char: ch, formula: whole });
  }

  if (stack.length !== 1) fail('unbalancedParens', { formula: whole });
  return out;
}

/** Molar mass in g/mol. */
export function molarMass(formula) {
  return parseFormula(formula).reduce(
    (sum, { element, count }) => sum + ATOMIC_WEIGHTS[element] * count,
    0,
  );
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
