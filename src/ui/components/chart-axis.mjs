/**
 * Axis helpers shared by the canvas charts.
 *
 * Extracted from `KineticsPlot` when a second and third chart needed the same
 * tick rounding. The alternative was importing the helper from one plot
 * component into another, which makes the second depend on the first's file
 * existing for a reason that has nothing to do with either chart.
 */

/**
 * Round tick values at roughly `count` intervals.
 *
 * A 1/2/5×10ⁿ step rather than an even division of the range, because an even
 * division produces labels like 0.37 and 0.74 — arithmetically correct and
 * unreadable on an axis. The step is chosen so the ticks land on numbers a
 * reader can do arithmetic with.
 *
 * Negative `min` shifts the sequence, so a chart whose axis does not start at
 * zero (log Q runs negative) gets ticks at −4, −3, −2 rather than at multiples
 * of a step measured from zero.
 */
export function niceTicks(max, count = 5, min = 0) {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const first = Math.ceil(min / step) * step;
  const out = [];
  for (let v = first; v <= max + step * 0.001; v += step) {
    // Floating-point accumulation makes 0.30000000000000004 out of 0.1×3, which
    // prints as a tick label nobody wants.
    out.push(Number(v.toPrecision(12)));
  }
  return out;
}
