import { fmtSci } from './format.mjs';

/**
 * Human-readable one-line summaries for the history list.
 *
 * Moved out of the calc layer when i18n arrived: the calc modules are pure and
 * language-free, but a summary is a presentation string. Keeping it here also
 * means the summary follows the UI language at render time, so switching to
 * English re-renders the existing history in English rather than leaving old
 * entries stranded in the previous language.
 *
 * The record itself stores only `kind`, `inputs` and `outputs` — the summary is
 * derived, never persisted. That is what makes a language switch retroactive.
 *
 * Each summary is a named function in a table rather than a case in one long
 * switch. There are fourteen kinds and five of them branch again on `mode`, so
 * the switch ran to 170 lines with three levels of nesting in places — long
 * enough that adding a kind meant scrolling to find where it went, and that the
 * one entry which returns a different shape (a formula, not a measurement) was
 * easy to miss. The table makes the set of kinds visible at a glance and gives
 * every branch a name to be tested by.
 */

/**
 * Format a number for a history line.
 *
 * This used to be its own `v.toFixed(digits)`, which meant the summary and the
 * result panel could disagree about the same number — and for a trace amount
 * the summary said "0.00 g" while the panel said "5.844×10⁻⁸ g". One formatter
 * for both, so a value reads the same wherever it appears.
 *
 * The only difference from the panel is the fallback: a history line has to
 * stay legible when a field is missing, so a non-number renders as "?" rather
 * than the panel's em dash.
 */
const fmt = (v, digits = 2) => (
  typeof v === 'number' && Number.isFinite(v) ? fmtSci(v, digits) : '?'
);

/** A summary that branches on `mode`; `fallback` names the branch to use when
 *  the mode is missing or one this build does not know. */
const byMode = (table, fallback) => (i, o, t) => (table[i.mode] ?? table[fallback])(i, o, t);

const weigh = (i, o, t) => t('summaries.weigh', {
  mass: fmt(o.massG), formula: i.formula, volume: i.volumeMl, molarity: i.molarity,
});

const dilution = (i, o, t) => t('summaries.dilution', {
  stock: fmt(o.stockVolumeMl), diluent: fmt(o.diluentVolumeMl),
  from: i.stockConc, to: i.targetConc,
});

const series = (i, o, t) => t('summaries.series', {
  steps: i.steps, factor: i.factor, stock: i.stockConc, volume: i.stepVolumeMl,
});

const buffer = (i, o, t) => t('summaries.buffer', { ph: i.targetPh, pka: i.pKa });

const ph = (i, o, t) => t('summaries.ph', {
  kind: i.kind === 'acid' ? t('ph.weakAcid') : t('ph.weakBase'),
  pk: i.pk, conc: i.conc,
});

/** The percent tab asks two different questions, and the answer to one is a
 *  mass while the answer to the other is a concentration. */
const percent = (i, o, t) => (o.massG != null
  ? t('summaries.percentPrepare', { percent: i.percent, formula: i.formula, volume: i.volumeMl })
  : t('summaries.percentConvert', { molarity: i.molarity, formula: i.formula }));

/**
 * Name the acid by its actual type. A polyprotic acid is not a "weak acid" in
 * the sense the summary used to imply, and labelling it that way makes the
 * history entry wrong about what was calculated.
 */
const curve = (i, o, t) => {
  const kind = t(`curve.${i.acidType ?? 'weakAcid'}`);
  const detail = i.pKas?.length ? ` (pKa ${i.pKas.join('/')})`
    : i.pKa != null ? ` (pKa ${i.pKa})` : '';
  return t('summaries.curve', {
    conc: i.conc,
    acidKind: `${kind}${detail}`,
    volume: i.volumeMl,
    eqVolume: fmt(o.equivalenceMl),
    eqPh: fmt(o.equivalencePh),
  });
};

/**
 * Five directions share one kind, so the summary branches on `mode`. Without
 * that branch every reagent calculation would read as a stock conversion,
 * which is wrong for four of the five.
 */
const reagent = byMode({
  volume: (i, o, t) => t('summaries.reagentVolume', {
    volume: fmt(o.volumeMl), percent: i.percent, formula: i.formula,
    target: i.targetVolumeMl, molarity: i.targetMolarity,
  }),
  normality: (i, o, t) => t('summaries.reagentNormality', {
    molarity: i.molarity, formula: i.formula, n: i.n, normality: fmt(o.normality, 3),
  }),
  molality: (i, o, t) => t('summaries.reagentMolality', {
    moles: i.moles, solvent: i.solventKg, molality: fmt(o.molality, 4),
  }),
  ionic: (i, o, t) => t('summaries.reagentIonic', {
    ionicStrength: fmt(o.ionicStrength, 4), n: i.ions?.length ?? 0,
  }),
  stock: (i, o, t) => t('summaries.reagentStock', {
    percent: i.percent, formula: i.formula, density: i.density, molarity: fmt(o.molarity),
  }),
}, 'stock');

const spectro = byMode({
  curve: (i, o, t) => t('summaries.spectroCurve', {
    n: o.fit?.n ?? 0, r2: fmt(o.fit?.r2, 4), conc: fmt(o.pred?.value, 6),
  }),
  concentration: (i, o, t) => t('summaries.spectroConc', {
    absorbance: fmt(o.absorbance, 4), conc: fmt(o.conc, 8),
  }),
  absorbance: (i, o, t) => t('summaries.spectroAbs', {
    epsilon: i.epsilon, conc: i.conc, path: i.pathCm, absorbance: fmt(o.absorbance, 4),
  }),
}, 'absorbance');

/** Four directions share one kind, so the summary branches on `mode`. */
const lab = byMode({
  cfu: (i, o, t) => t('summaries.labCfu', {
    colonies: i.colonies, factor: i.dilutionFactor, cfu: fmt(o.cfuPerMl, 4),
  }),
  nucleic: (i, o, t) => t('summaries.labNucleic', {
    length: i.lengthBp, kind: t(`lab.na_${i.kind}`),
    pmol: fmt(o.pmolPerUl, 4), copies: fmt(o.copiesPerUl, 4),
  }),
  mix: (i, o, t) => t('summaries.labMix', {
    reactions: i.reactions, excess: i.excessPercent,
    volume: fmt(o.totalVolume, 1), n: o.rows?.length ?? 0,
  }),
  moles: (i, o, t) => t('summaries.labMoles', {
    formula: i.formula, mass: fmt(o.massG, 4), moles: fmt(o.moles, 6),
  }),
}, 'moles');

const colligative = byMode({
  osmotic: (i, o, t) => t('summaries.colligativeOsmotic', {
    molarity: i.molarity, i: i.i, atm: fmt(o.atm, 4),
  }),
  unknown: (i, o, t) => t('summaries.colligativeUnknown', {
    drop: i.deltaTf, solvent: t(`colligative.solvent_${i.solvent}`), molarMass: fmt(o.molarMass, 2),
  }),
  shift: (i, o, t) => t('summaries.colligativeShift', {
    solvent: t(`colligative.solvent_${i.solvent}`), molality: i.molality,
    deltaTf: fmt(o.deltaTf, 4), freezingPoint: fmt(o.freezingPoint, 3),
  }),
}, 'shift');

const reaction = byMode({
  limiting: (i, o, t) => t('summaries.reactionLimiting', {
    equation: i.equation, limiting: o.limiting ?? '—', extent: fmt(o.extent, 5),
  }),
  formula: (i, o, t) => t('summaries.reactionFormula', {
    formula: o.formula, M: fmt(o.molarMass, 3), n: i.entries?.length ?? 0,
  }),
  balance: (i, o, t) => t('summaries.reactionBalance', { equation: o.equation ?? i.equation }),
}, 'balance');

/**
 * Both directions report a potential; only the cell mode knows which electrode
 * is which, so the summary names them when they are present.
 */
const electro = byMode({
  cell: (i, o, t) => t('summaries.electroCell', {
    cathode: i.cathode, anode: i.anode, e: fmt(o.e, 4),
  }),
  nernst: (i, o, t) => t('summaries.electroNernst', {
    e0: i.e0, n: i.n, q: i.q, e: fmt(o.e, 4),
  }),
}, 'nernst');

/** Every kind the history can hold. Two share one summary: the weigh tab
 *  records a solid as either kind depending on which direction was used. */
const BY_KIND = {
  massForMolarity: weigh,
  stockFromSolid: weigh,
  dilution,
  dilutionSeries: series,
  bufferRecipe: buffer,
  phCalc: ph,
  percentSolution: percent,
  titrationCurve: curve,
  reagent,
  spectro,
  lab,
  colligative,
  reaction,
  electro,
};

export function recordSummary(record, t) {
  const kind = record?.kind ?? 'unknown';
  const summary = BY_KIND[kind];
  // An unknown kind renders as its translated name rather than throwing: a
  // history list that dies on one bad row loses all of them.
  if (!summary) return t(`kinds.${kind}`);
  return summary(record?.inputs ?? {}, record?.outputs ?? {}, t);
}
