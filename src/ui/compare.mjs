/**
 * Axes and series for the element comparison chart.
 *
 * A radar is the only way to put electronegativity (0.7 to 3.98) and density
 * (8.99e-5 to 22.57) on one diagram: each axis is normalised to its own range,
 * so every property gets the same visual weight. The cost of that is real and
 * worth stating — a factor of two looks identical on both axes, so the chart
 * is read for the *shape* of an element, and the numbers come from the table
 * printed beneath it rather than from the picture.
 *
 * Everything here is pure geometry: it takes the elements, a function from
 * element to its physical properties, and returns axes and vertex lists. The
 * component does not decide any of it, which is what makes the arithmetic
 * testable without a browser.
 */

import { COLOR_PROPERTIES, rangeOf, positionOf, valueOf } from './heat.mjs';

/**
 * Which properties the comparison uses, in the order the axes are drawn.
 *
 * `yearDiscovered` is deliberately absent. Every other property is a physical
 * measurement of the atom or its bulk solid; the year an element was isolated
 * is a fact about human history, and a chart that plotted it alongside melting
 * point would invite reading a trend that does not exist.
 *
 * The order runs size, then mass, then the electronic properties, then the
 * bulk ones, so adjacent axes are related and the polygon has a readable shape
 * rather than one that zig-zags.
 */
export const COMPARE_KEYS = [
  'rcow', 'rvdw', 'mass', 'electronegativity', 'ionization', 'melt', 'boil', 'density',
];

/**
 * One axis per comparable property.
 *
 * A property measured for no element at all is dropped rather than drawn as a
 * degenerate axis — an axis with no data is a line of spokes that implies a
 * quantity nobody recorded.
 */
export function compareAxes(elements, propsFor, keys = COMPARE_KEYS) {
  const axes = [];
  for (const key of keys) {
    if (!COLOR_PROPERTIES[key]) continue;
    const range = rangeOf(elements, propsFor, key);
    if (range.count === 0) continue;

    /*
     * No tick list here. Each axis is normalised to its own range, so every
     * axis has the same visual length and the ring fractions mean the same
     * thing on all of them — a per-axis tick would have to be labelled with
     * that axis's own numbers, and eight sets of numbers around one circle is
     * a table that has been bent into a ring. The numbers live in the value
     * table below the chart, where they can be read.
     */
    axes.push({
      key,
      range,
      // Counted for the same reason the legend counts it: an axis drawn from
      // 96 of 118 elements should not read as if it covered all of them. The
      // comparison table prints this as a note under the numbers.
      present: elements.reduce(
        (n, el) => n + (valueOf(el, propsFor(el), key) === null ? 0 : 1),
        0,
      ),
    });
  }
  return axes;
}

/**
 * One entry per element, with a vertex position on every axis.
 *
 * `pos` is null where the element has no measurement, and the caller must keep
 * that distinct from a low value: a missing melting point is not a cold one,
 * and the component draws the two differently.
 */
export function compareSeries(elements, axes, propsFor) {
  return elements.map((el) => ({
    symbol: el.symbol,
    zh: el.zh,
    name: el.name,
    points: axes.map((ax) => {
      const value = valueOf(el, propsFor(el), ax.key);
      return { key: ax.key, value, pos: positionOf(value, ax.range) };
    }),
  }));
}

/**
 * Cartesian position of a normalised value on axis `index` of `count`.
 *
 * Axis 0 points straight up, so the first property in `COMPARE_KEYS` is the
 * one at twelve o'clock — the position a reader looks at first.
 */
export function radarPoint(index, count, pos, radius) {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  const r = pos * radius;
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

/**
 * Split a series' vertices into runs of consecutive known values.
 *
 * The temptation is to treat a missing value as zero and draw a closed
 * polygon; that draws the outline straight through the centre and asserts the
 * element has almost none of that property. Instead each run of adjacent known
 * vertices is drawn on its own, and a run that covers every axis — the usual
 * case — is the one that gets closed and filled. A single missing value breaks
 * helium's outline into an open path, which is what the data actually
 * supports.
 */
export function radarRuns(series, axes, radius) {
  const n = axes.length;
  const at = (i) => {
    const pt = series.points[i];
    if (pt.pos === null) return null;
    const { x, y } = radarPoint(i, n, pt.pos, radius);
    return { x, y, key: pt.key };
  };

  const missing = series.points.map((p) => p.pos === null);
  const gap = missing.indexOf(true);

  // Nothing missing: one ring, drawn closed and filled.
  if (gap === -1) {
    return { runs: [Array.from({ length: n }, (_, i) => at(i))], closed: true };
  }

  /*
   * Walk the axes as a ring, starting just after a missing value.
   *
   * The start point is what makes this correct. Walking from index 0 and
   * cutting at every gap splits a ring with a single hole into two arcs and
   * never draws the edge that joins the last known vertex back to the first —
   * an edge whose two ends are both known, so it belongs in the outline.
   * Starting immediately after a hole means every run is maximal and the ring
   * closes wherever the data allows.
   */
  const runs = [];
  let current = [];
  for (let k = 0; k < n; k += 1) {
    const i = (gap + 1 + k) % n;
    const point = at(i);
    if (point === null) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length > 0) runs.push(current);

  // The caller needs to know whether it got a ring, because filling an open
  // path fabricates the area it would enclose. A single run that spans every
  // axis can only happen when nothing was missing, which is the branch above —
  // so anything reaching here is open by construction, and the flag is derived
  // rather than assumed.
  const closed = runs.length === 1 && runs[0].length === n;
  return { runs, closed };
}

/** SVG path data for a run of points, closed only when the caller asks. */
export function pathOf(points, close = false) {
  if (points.length === 0) return '';
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  return close ? `${d}Z` : d;
}

/**
 * Format a value for an axis label or the value table.
 *
 * Log-scaled properties run below 1e-3 (density) or above 1e5 (nothing here,
 * but the mode is shared), so `fmtSci` is right for the whole axis rather than
 * for the individual value: a scale must not switch notation partway along, or
 * the two ends stop being comparable.
 */
export function scaleOf(range) {
  return range.log ? 'sci' : 'plain';
}

/**
 * Outline colours per theme.
 *
 * Okabe-Ito is designed for a dark background. Its own recommended light-mode
 * substitutions are used here instead: on a white surface the palette's
 * orange, sky blue and yellow fall to contrast ratios of 2.25, 2.31 and 1.32,
 * which makes the fourth element in a comparison — the one that gets yellow —
 * the hardest to see rather than the easiest.
 *
 * Measured against the surface each set is drawn on: every colour below clears
 * 4.5:1 on its own background.
 */
export const SERIES_COLORS = {
  dark: ['#E69F00', '#56B4E9', '#009E73', '#F0E442'],
  light: ['#7A4E00', '#00618F', '#006B4F', '#5C5200'],
};

/** The series colour for the nth element, in the given theme. */
export function seriesColor(index, theme = 'dark') {
  const set = SERIES_COLORS[theme] ?? SERIES_COLORS.dark;
  return set[index % set.length];
}