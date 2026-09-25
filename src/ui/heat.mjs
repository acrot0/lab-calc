/**
 * Colour-scale arithmetic for the periodic table's numeric properties.
 *
 * Kept out of the component because the interesting part is not the rendering
 * but the choice of scale, and that choice is worth testing: getting it wrong
 * does not throw, it just shades the table misleadingly.
 *
 * The problem this solves: the properties span wildly different dynamic ranges.
 * Electronegativity runs 0.7 to 3.98 — a factor of 5.7. Density runs 8.99e-5
 * to 22.57 — a factor of 251,000. On a linear ramp, density is a picture of
 * osmium and iridium with the other 94 elements collapsed into the bottom
 * pixel of the scale, which is worse than no colouring at all: it implies the
 * gases are all equally light.
 */

/**
 * Which property each colouring mode reads, and where the value lives.
 *
 * `from` matters because the two tables are separate files: the element table
 * carries atomic weight and the two radii, while PubChem's data carries the
 * physical properties. Merging them here rather than in the component keeps
 * the lookup in one place.
 */
export const COLOR_PROPERTIES = {
  mass: { from: 'element', key: 'mass', unit: 'g/mol' },
  rcow: { from: 'element', key: 'rcow', unit: 'Å' },
  rvdw: { from: 'element', key: 'rvdw', unit: 'Å' },
  electronegativity: { from: 'properties', key: 'electronegativity', unit: '' },
  melt: { from: 'properties', key: 'melt', unit: 'K' },
  boil: { from: 'properties', key: 'boil', unit: 'K' },
  density: { from: 'properties', key: 'density', unit: 'g/cm³' },
  ionization: { from: 'properties', key: 'ionization', unit: 'eV' },
  yearDiscovered: { from: 'properties', key: 'yearDiscovered', unit: '' },
};

export const NUMERIC_KEYS = Object.keys(COLOR_PROPERTIES);

/**
 * Above this ratio between the largest and smallest value, a linear ramp stops
 * resolving the low end and the scale switches to logarithmic.
 *
 * 100 is a judgement, not a derivation. It is the point where the bottom
 * decade of the range occupies under 1% of the ramp — enough to make the low
 * end indistinguishable, not so tight that ordinary quantities get a log scale
 * they do not need. Electronegativity (5.7) stays linear; melting point
 * (4,000) and density (251,000) go logarithmic.
 */
export const LOG_THRESHOLD = 100;

/** Read one property off an element, given its `from` table. */
export function valueOf(el, properties, mode) {
  const spec = COLOR_PROPERTIES[mode];
  if (!spec) return null;
  const src = spec.from === 'properties' ? properties : el;
  const v = src?.[spec.key];
  return Number.isFinite(v) ? v : null;
}

/**
 * The range of a property across the table, plus which scale to draw it on.
 *
 * Values that are null are skipped rather than treated as zero: an element
 * whose melting point has never been measured is not the coldest one. The
 * count is reported so the legend can say how many of the 118 are actually
 * represented — a scale drawn from 96 points should not read as if it covered
 * all of them.
 */
export function rangeOf(elements, propsFor, mode) {
  const vals = [];
  for (const el of elements) {
    const v = valueOf(el, propsFor(el), mode);
    // Zero is a legitimate value for a year but never for a physical quantity
    // here, and log(0) is undefined — filter it out of the log branch only.
    if (v !== null && v > 0) vals.push(v);
  }
  if (vals.length === 0) return { min: 0, max: 1, log: false, count: 0 };
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const log = min > 0 && max / min >= LOG_THRESHOLD;
  return { min, max, log, count: vals.length };
}

/**
 * Where a value sits on its range, 0 to 1.
 *
 * Returns null for a missing value so the caller can render "no data"
 * distinctly from "the lowest value" — the table draws those differently, and
 * a shade at the bottom of the ramp would be a false claim about the element.
 */
export function positionOf(value, range) {
  if (value === null || !Number.isFinite(value)) return null;
  if (range.max === range.min) return 0.5;
  if (range.log) {
    if (value <= 0) return null;
    const lo = Math.log10(range.min);
    const hi = Math.log10(range.max);
    return (Math.log10(value) - lo) / (hi - lo);
  }
  return (value - range.min) / (range.max - range.min);
}

/**
 * Tick values for the legend, chosen for the scale actually in use.
 *
 * A log scale needs round powers of ten and a linear one needs round numbers;
 * reusing one set for both labels an axis with values that do not mark where
 * they claim to.
 *
 * The ends are always the true range ends rather than a rounded power of ten,
 * so the legend says what the ramp actually spans. Intermediate ticks are
 * built by parsing `1e<exp>` rather than by `10 ** exp`: the pow operator
 * rounds, and `10 ** -4` comes out as 0.00009999999999999999 — a legend
 * label, printed at full length, of a value that is not the one it means.
 */
export function ticksOf(range, count = 4) {
  if (range.log) {
    const firstExp = Math.ceil(Math.log10(range.min));
    const lastExp = Math.floor(Math.log10(range.max));
    const out = [];
    const span = lastExp - firstExp;
    if (span > 0) {
      const step = Math.max(1, Math.ceil(span / Math.max(1, count - 2)));
      for (let e = firstExp; e <= lastExp; e += step) out.push(Number(`1e${e}`));
    }
    // The true ends go on last, and only if the rounded ticks did not already
    // land on them — density runs 8.99e-5 to 22.57, and a legend that rounds
    // those misstates the span of the ramp.
    if (out.length === 0 || out[0] !== range.min) out.unshift(range.min);
    if (out[out.length - 1] !== range.max) out.push(range.max);
    return out;
  }
  return Array.from({ length: count }, (_, i) => range.min + ((range.max - range.min) * i) / (count - 1));
}

/**
 * Ticks to actually label, thinned so two of them cannot land on one another.
 *
 * `ticksOf` returns every tick worth marking, and on a log ramp two of them can
 * sit a few pixels apart: density spans 8.99e-5 to 22.57, so the first decade
 * (1e-4) falls 1.6% along a ramp that already starts at 8.99e-5. Two labels
 * drawn on the same spot are worse than one, and the one worth keeping is the
 * end, because the ends are what say how far the ramp reaches.
 *
 * `minGap` is a fraction of the ramp's length rather than a pixel count, so
 * this stays testable without a layout engine; 0.3 is about 48px on the 160px
 * legend the periodic table draws — wide enough for the label boxes this table
 * produces ("1896.333" is the longest, about 46px).
 *
 * Linear scales get three ticks rather than four. Four ends up as 0, ⅓, ⅔, 1,
 * and the tick at ⅔ lands close enough to the end label that the two overprint
 * on a bar this wide; the middle of a linear range is also the least
 * informative place to spend a label.
 */
export function fitTicks(range, minGap = 0.3) {
  return thinTicks(ticksOf(range, range.log ? 4 : 3), range, minGap)
    .map((value) => ({ value, pos: positionOf(value, range) }));
}

/**
 * Drop the interior values of an already-chosen tick list that are too close
 * together, keeping both ends. Takes and returns plain numbers, like `ticksOf`
 * — the caller adds positions, so there is no second tick type to confuse.
 *
 * Split out from `fitTicks` because the comparison chart needs the same rule
 * applied to a log axis carrying a full set of decades rather than a thinned
 * sample: eight axes each labelled with their own range, where two labels at
 * the top of an axis collide exactly as they do on the legend.
 */
export function thinTicks(all, range, minGap = 0.3) {
  const lastIdx = all.length - 1;
  const endPos = positionOf(all[lastIdx], range);
  const kept = [];
  for (let i = 0; i <= lastIdx; i += 1) {
    const pos = positionOf(all[i], range);
    if (pos === null) continue;
    // Both ends are kept unconditionally — they are the claims the ramp makes
    // about its own span, and a label thinned out of existence would leave the
    // legend unable to say where the scale stops.
    if (i !== 0 && i !== lastIdx) {
      const behind = Math.abs(pos - positionOf(kept[kept.length - 1], range));
      const ahead = Math.abs(endPos - pos);
      if (behind < minGap || ahead < minGap) continue;
    }
    kept.push(all[i]);
  }
  return kept;
}
