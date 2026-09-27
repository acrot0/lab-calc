import { fmt, fmtSci } from './format.mjs';

/*
 * The recipe card: what to actually do at the bench.
 *
 * ## Why this is derived at export time rather than returned by the calculator
 *
 * The calc layer is pure and throws `CalcError` with a code; it never emits
 * user-visible prose. That separation is what lets the same calculation be
 * rendered in two languages, and it is the reason the calc modules contain no
 * strings a translator would need to find. A `procedure` field returned from
 * `massForMolarity` would have to carry either a sentence — breaking the rule —
 * or a template key and its parameters, which is a worse shape than deriving
 * the steps from the inputs and outputs that are already there.
 *
 * So this module reads the record and writes the steps. It is the export
 * layer's job, which is where the words already live.
 *
 * ## What the steps are for
 *
 * An export of `volume=500; molarity=0.5` is data. A person who has to make the
 * solution needs the operations in order, with the number that goes with each
 * one: weigh this much, transfer it, dilute to the mark. The arithmetic is
 * already in the file; what is missing is the sequence.
 *
 * ## Only the four that are genuinely procedural
 *
 * Weighing, diluting, buffer preparation and serial dilution are four things a
 * person does with their hands. A Nernst potential is not a procedure and gets
 * no steps — inventing them would be padding, and the ones that were invented
 * would be wrong in a way nobody would catch until the bench.
 */

/**
 * Step templates per kind, in both languages.
 *
 * `value` names which number from the record's outputs goes in the step; the
 * renderer substitutes it. Kept as data rather than as a switch so a kind can
 * be added without touching the rendering, and so the test can walk every kind
 * and assert the steps it produces.
 */
const RECIPES = {
  massForMolarity: {
    title: { zh: '配制 {conc} {formula} 溶液 {vol}', en: 'Prepare {vol} of {conc} {formula}' },
    steps: [
      { zh: '称取 {formula} 固体 {mass}', en: 'Weigh out {mass} of {formula}' },
      { zh: '转移至 {vol} 容量瓶', en: 'Transfer to a {vol} volumetric flask' },
      { zh: '加去离子水至刻度，摇匀', en: 'Make up to the mark with deionised water and mix' },
    ],
  },
  stockFromSolid: {
    title: { zh: '配制 {conc} {formula} 溶液 {vol}', en: 'Prepare {vol} of {conc} {formula}' },
    steps: [
      { zh: '称取 {formula} 固体 {mass}', en: 'Weigh out {mass} of {formula}' },
      { zh: '转移至 {vol} 容量瓶', en: 'Transfer to a {vol} volumetric flask' },
      { zh: '加去离子水至刻度，摇匀', en: 'Make up to the mark with deionised water and mix' },
    ],
  },
  dilution: {
    title: { zh: '稀释至 {conc}，总体积 {vol}', en: 'Dilute to {conc}, total volume {vol}' },
    steps: [
      { zh: '量取母液 {stock}', en: 'Measure {stock} of stock solution' },
      { zh: '转移至 {vol} 容量瓶', en: 'Transfer to a {vol} volumetric flask' },
      { zh: '加稀释剂至刻度，摇匀', en: 'Make up to the mark with diluent and mix' },
    ],
  },
  bufferRecipe: {
    title: { zh: '配制 pH {ph} 缓冲液，总浓度 {conc}', en: 'Prepare pH {ph} buffer, total {conc}' },
    steps: [
      { zh: '按酸 {acid} : 碱 {base} 的比例称取组分', en: 'Weigh the components in the ratio acid {acid} : base {base}' },
      { zh: '溶于约 80% 体积的去离子水', en: 'Dissolve in about 80% of the final volume of deionised water' },
      { zh: '调 pH 至 {ph}，再定容摇匀', en: 'Adjust to pH {ph}, then make up to volume and mix' },
    ],
  },
  dilutionSeries: {
    title: { zh: '{steps} 步梯度稀释，倍数 {factor}', en: '{steps}-step serial dilution, factor {factor}' },
    steps: [
      { zh: '每管加入 {vol} 稀释剂', en: 'Add {vol} of diluent to each tube' },
      { zh: '第 1 管加入母液，混匀', en: 'Add stock to tube 1 and mix' },
      { zh: '逐管转移 {vol} 至下一管，混匀', en: 'Transfer {vol} from each tube to the next, mixing' },
    ],
  },
};

/** Whether a kind has a procedure at all. */
export function hasProcedure(kind) {
  return Object.hasOwn(RECIPES, kind);
}

/** Every kind that has a recipe. For the test that walks them all. */
export function proceduralKinds() {
  return Object.keys(RECIPES);
}

/** A number with a unit, using the app's own formatting so it matches the UI. */
function amount(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  // `fmtSci` for the values that would otherwise print as `0.00`: a serial
  // dilution's transfer volume is routinely in the microlitre range, and a
  // recipe that says "transfer 0.00 mL" is worse than no recipe.
  const shown = Math.abs(value) > 0 && Math.abs(value) < 0.01 ? fmtSci(value, 3) : fmt(value, 3);
  return `${shown} ${unit}`;
}

/**
 * The substitution values for a record.
 *
 * Every one is optional — a record from an older version may be missing the
 * field a step needs, and the step is then dropped rather than printed with a
 * blank. A recipe with a missing number is one someone will follow.
 */
function valuesFor(record) {
  const i = record?.inputs ?? {};
  const o = record?.outputs ?? {};
  const conc = (v, unit) => (typeof v === 'number' ? `${fmt(v, 4)} ${unit}` : null);

  return {
    formula: i.formula ?? null,
    /*
     * One placeholder for "the concentration of what is being made", under the
     * three names the tabs give it: weighing says `molarity`, dilution says
     * `targetConc`, and a buffer says `totalConc`. They are the same quantity
     * from the recipe's point of view, so they resolve to one value rather than
     * to three placeholders that always hold the same thing.
     */
    conc: conc(i.molarity ?? i.targetConc ?? i.totalConc, 'mol/L'),
    vol: amount(i.volumeMl ?? i.targetVolumeMl, 'mL'),
    mass: amount(o.massG, 'g'),
    stock: amount(o.stockVolumeMl, 'mL'),
    ph: typeof i.targetPh === 'number' ? fmt(i.targetPh, 2) : null,
    factor: typeof i.factor === 'number' ? fmt(i.factor, 0) : null,
    steps: typeof i.steps === 'number' ? String(i.steps) : null,
    /*
     * The serial dilution's per-step volume.
     *
     * The tab records it as an input, but the output is an array of per-step
     * rows each carrying its own `stepVolumeMl` — so the first row is the
     * fallback for a record that stored it only there.
     */
    stepVol: amount(i.stepVolumeMl ?? o.series?.[0]?.stepVolumeMl, 'mL'),
    /*
     * The buffer's two components, which the tab computes as concentrations
     * rather than as masses — there is no molar mass in that calculation, since
     * the recipe is stated as a ratio.
     */
    acid: typeof o.acidConc === 'number' ? `${fmt(o.acidConc, 4)} mol/L` : null,
    base: typeof o.baseConc === 'number' ? `${fmt(o.baseConc, 4)} mol/L` : null,
  };
}

/**
 * Substitute `{name}` placeholders, or return null if any value is missing.
 *
 * Returning null rather than a partly-filled string is the whole safety
 * property: a step reading "Weigh out  of NaCl" is one a tired person follows.
 * A dropped step is noticed; a blank one is not.
 */
function fill(template, values) {
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = values[name];
    if (v === null || v === undefined || v === '') { missing = true; return ''; }
    return v;
  });
  return missing ? null : out;
}

/**
 * The procedure for one record, or null when the kind has none.
 *
 * Returns `{ title, steps: string[] }` with the steps already in the requested
 * language. A step whose numbers are missing from the record is omitted; if
 * that leaves nothing, the whole procedure is null, because a titled recipe
 * with no steps is a promise the file does not keep.
 */
export function procedureFor(record, locale = 'zh') {
  const recipe = RECIPES[record?.kind];
  if (!recipe) return null;
  const values = valuesFor(record);
  /*
   * A serial dilution has no single "final volume" — each tube holds the same
   * volume, and it is that per-step volume the steps name. Aliased here rather
   * than given its own placeholder in the templates, because `{vol}` already
   * means "the volume you work in" on every other recipe.
   */
  if (record?.kind === 'dilutionSeries') values.vol = values.stepVol;

  /*
   * The title must resolve, and that is the gate on the whole procedure.
   *
   * Every title names the parameters that identify what is being made — the
   * substance and its concentration and volume, or the pH and total
   * concentration, or the step count and factor. If none of those is in the
   * record, the file does not say what the recipe is for, and the only steps
   * left are the generic ones ("make up to the mark") which are meaningless
   * without it. Returning null drops the card entirely rather than printing a
   * heading-less list of platitudes.
   */
  const title = fill(locale === 'en' ? recipe.title.en : recipe.title.zh, values);
  if (title === null) return null;

  const steps = recipe.steps
    .map((s) => fill(locale === 'en' ? s.en : s.zh, values))
    .filter((s) => s !== null);
  if (steps.length === 0) return null;

  return { title, steps };
}

/**
 * The procedures for a set of records, skipping the ones that have none.
 *
 * Used by the Markdown export, where the recipe cards are appended after the
 * table. The order is the order of the records, so a card can be matched to its
 * row by the reader.
 */
export function proceduresFor(entries, locale = 'zh') {
  return (entries ?? [])
    .map((e) => {
      const p = procedureFor(e, locale);
      return p ? { summary: e?.summary ?? '', ...p } : null;
    })
    .filter(Boolean);
}
