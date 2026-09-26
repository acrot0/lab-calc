/**
 * Where each Phosphor glyph's ink actually sits inside its 256 grid.
 *
 * ## The problem this solves
 *
 * Phosphor draws every icon on a 256×256 grid but does not draw them to a
 * common size or centre. Measured across the 46 glyphs this app uses:
 *
 * - the ink box ranges from 144×224 (`dna`) to 240×240 (`spectro`) — a 1.5×
 *   difference in apparent size at the same `size` prop;
 * - `colligative` (Thermometer) has its ink centred 20 units right of the grid
 *   centre, which is 7.8% of the box — visible as a glyph that leans.
 *
 * A row of these at 20px does not look like a designed set; it looks like
 * several sets, which is what "the icons are inconsistent" means when it is
 * hard to point at. The eye reads apparent size and alignment, and both vary.
 *
 * ## What the numbers are
 *
 * `x`/`y` are the ink box's top-left and `w`/`h` its size, all in the 256-unit
 * grid. They were measured by rendering each glyph in a browser and taking the
 * union of `getBBox()` over its shapes — not read from the icon source, because
 * several glyphs are stroked, and a stroked `<circle>` has a bounding box wider
 * than its path data suggests.
 *
 * ## Regenerating
 *
 * `tools/icon-audit.html` renders every glyph with a crosshair on its grid
 * centre and prints this table. Open it under `npm run dev` and paste the
 * output over the block below. There is no headless browser in the project's
 * dependencies and adding one would be 300MB for a script that runs when an
 * icon is added; the page emits the table in this exact format so nothing is
 * transcribed by hand, because a hand-copied number is the one kind of error
 * the audit cannot catch.
 *
 * `test/icons.test.mjs` renders every glyph and checks the table still matches,
 * so a Phosphor upgrade that moves a glyph fails there rather than silently
 * mis-correcting one icon.
 *
 * ## Why this is a table and not a build step
 *
 * Transforming the icon source at build time would need a fork of the package.
 * The correction here is a `viewBox` and a `transform` on the `<svg>` — no path
 * data is touched — so it is exact for scale and translation, which is all the
 * fix needs.
 */

/**
 * Every glyph the app uses, keyed by the name in `icons.jsx`.
 *
 * A glyph that is not listed is rendered unnormalised, which is the right
 * default for one added without running the audit: it looks like every other
 * Phosphor icon does, rather than like a wrongly-corrected one.
 */
export const ICON_INK = {
  beaker: { x: 32.0, y: 24.0, w: 192.0, h: 200.0 },
  branch: { x: 48.0, y: 32.0, w: 184.0, h: 192.0 },
  buffer: { x: 24.0, y: 24.0, w: 216.0, h: 208.0 },
  calc: { x: 32.0, y: 40.0, w: 192.0, h: 184.0 },
  caret: { x: 40.0, y: 88.0, w: 176.0, h: 96.0 },
  check: { x: 32.0, y: 64.0, w: 200.0, h: 144.0 },
  close: { x: 48.0, y: 48.0, w: 160.0, h: 160.0 },
  collapseNav: { x: 32.0, y: 40.0, w: 176.0, h: 176.0 },
  colligative: { x: 56.0, y: 8.0, w: 184.0, h: 240.0 },
  convert: { x: 40.0, y: 40.0, w: 176.0, h: 176.0 },
  csv: { x: 39.8, y: 24.0, w: 176.2, h: 192.0 },
  curve: { x: 24.0, y: 40.0, w: 208.4, h: 176.0 },
  dilute: { x: 32.0, y: 32.0, w: 192.0, h: 192.0 },
  dna: { x: 56.0, y: 16.0, w: 144.0, h: 224.0 },
  download: { x: 32.0, y: 24.0, w: 192.0, h: 192.0 },
  electro: { x: 40.0, y: 8.0, w: 176.0, h: 239.9 },
  elements: { x: 32.0, y: 32.0, w: 192.0, h: 192.0 },
  expandNav: { x: 24.0, y: 40.0, w: 208.0, h: 176.0 },
  gauge: { x: 16.0, y: 40.0, w: 224.0, h: 152.0 },
  history: { x: 24.0, y: 32.0, w: 199.9, h: 192.0 },
  icons: { x: 16.0, y: 24.0, w: 216.0, h: 192.0 },
  json: { x: 40.0, y: 24.0, w: 176.0, h: 208.0 },
  lab: { x: 40.0, y: 24.0, w: 176.0, h: 208.0 },
  language: { x: 24.0, y: 24.0, w: 224.0, h: 200.0 },
  layers: { x: 24.0, y: 16.0, w: 208.1, h: 224.0 },
  markdown: { x: 40.0, y: 24.0, w: 176.0, h: 208.0 },
  microscope: { x: 24.0, y: 16.0, w: 208.0, h: 208.0 },
  more: { x: 16.0, y: 96.0, w: 224.0, h: 64.0 },
  notice: { x: 32.0, y: 40.0, w: 192.0, h: 200.0 },
  percent: { x: 40.0, y: 40.0, w: 176.0, h: 176.0 },
  ph: { x: 16.0, y: 32.0, w: 224.0, h: 184.0 },
  reaction: { x: 16.0, y: 32.0, w: 224.0, h: 192.0 },
  reagent: { x: 40.0, y: 8.0, w: 176.0, h: 224.0 },
  remove: { x: 32.0, y: 16.0, w: 192.0, h: 208.0 },
  replay: { x: 16.0, y: 32.0, w: 208.0, h: 192.0 },
  search: { x: 23.8, y: 23.8, w: 208.2, h: 208.2 },
  analytical: { x: 24.0, y: 40.0, w: 208.0, h: 176.0 },
  series: { x: 32.0, y: 48.0, w: 192.0, h: 160.0 },
  settings: { x: 16.0, y: 24.0, w: 224.0, h: 208.0 },
  shortcuts: { x: 16.0, y: 48.0, w: 224.0, h: 160.0 },
  spectro: { x: 8.0, y: 8.0, w: 240.0, h: 240.0 },
  stats: { x: 56.0, y: 40.0, w: 144.0, h: 176.0 },
  syringe: { x: 16.0, y: 16.0, w: 224.0, h: 224.0 },
  trend: { x: 16.0, y: 48.0, w: 224.0, h: 144.0 },
  uncertainty: { x: 16.0, y: 16.0, w: 224.0, h: 224.0 },
  upload: { x: 32.0, y: 24.0, w: 192.0, h: 192.0 },
  warning: { x: 16.0, y: 24.0, w: 224.0, h: 200.0 },
  waves: { x: 31.8, y: 48.0, w: 192.2, h: 160.0 },
  physical: { x: 16.1, y: 56.0, w: 223.8, h: 144.0 },
  weigh: { x: 32.0, y: 24.0, w: 192.0, h: 200.0 },
};

/**
 * How much of the rendered box a glyph's longest side fills.
 *
 * 0.84 is Phosphor's own figure, near enough: its largest glyphs are 240 units
 * on a 256 grid, which is 0.9375 — but they are the exception, and matching the
 * exception would shrink the other forty-five. The median ink box in this set
 * is 196, which is 0.766, so 0.84 enlarges the typical glyph slightly and
 * shrinks only the two outliers (`spectro` at 240, `syringe` at 224). A set
 * normalised *up* reads heavier than the weight it was drawn at; this errs the
 * other way.
 *
 * The remainder is the margin, 8% on each side — which is also what keeps a
 * glyph from touching the edge of a button's hit area.
 */
const FILL = 0.84;

/** Four decimals is past the point where a 20px render can show a difference. */
function round(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * The `viewBox` that centres a glyph and gives it the common apparent size.
 *
 * Returns `null` for a glyph with no measurement, so the caller renders it
 * untouched rather than with a correction invented for it.
 *
 * ## Why a viewBox and not a transform
 *
 * Both corrections fall out of one number. A `viewBox` maps a region of the
 * glyph's own coordinate space onto the rendered box, so a square region
 * centred on the ink centre and sized in proportion to the ink gives:
 *
 * - **centring**, because the region's centre is the ink's centre; and
 * - **a common apparent size**, because the region's side is `max(w,h) / FILL`,
 *   so the ink always occupies the same fraction of what is shown.
 *
 * The alternative — a fixed `viewBox` plus a `transform` on a `<g>` — needs the
 * icon's own children to wrap, and Phosphor's components render their paths
 * themselves, so a `<g>` passed as a child is *added* rather than wrapped. The
 * viewBox version touches no content at all.
 *
 * The region may extend outside the original 256 grid, which is correct: it
 * shows empty space rather than clipping. `dna` (144 wide on a 256 grid) gets a
 * region far wider than its ink, and that is exactly what makes it render at
 * the same size as `spectro`.
 *
 * `preserveAspectRatio` keeps its default — the region is square and the
 * rendered box is square, so there is nothing to letterbox.
 */
export function normalize(key) {
  const ink = ICON_INK[key];
  if (!ink || !(ink.w > 0) || !(ink.h > 0)) return null;
  const side = Math.max(ink.w, ink.h) / FILL;
  const half = side / 2;
  const minX = ink.x + ink.w / 2 - half;
  const minY = ink.y + ink.h / 2 - half;
  return `${round(minX)} ${round(minY)} ${round(side)} ${round(side)}`;
}
