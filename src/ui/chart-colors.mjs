import { paletteOf, alpha } from './palettes.mjs';

/**
 * Chart colours, derived from the active palette.
 *
 * ## The bug this replaces
 *
 * Every canvas chart took a `theme` prop and looked it up in a two-entry map
 * keyed `dark` and `light`. But the prop is the *palette key* — `gruvbox`,
 * `solarized-light`, `catppuccin-mocha` — so all ten palettes matched neither
 * entry and fell through to the dark defaults. A chart on Catppuccin Latte drew
 * a white grid on a cream card: still readable, plainly wrong, and invisible to
 * any test that only checked the two themes the map happened to contain.
 *
 * Deriving from the palette fixes it for every theme at once, including ones
 * added later, because there is no list to forget to update.
 *
 * ## Why the values are computed rather than stored
 *
 * A chart needs four things a palette does not name directly: a grid line, a
 * label colour, a curve colour, and a translucent band. All four are derivable
 * from tokens the palette does define, and deriving them means a new palette
 * gets correct charts by existing. Storing them would be ten more values per
 * theme to get wrong, and the failure mode — a chart that is subtly off-theme —
 * is one nobody notices until a user does.
 */
export function chartColors(themeKey) {
  const { tokens } = paletteOf(themeKey);

  /*
   * The grid is the palette's own `gridLine` rather than a new alpha: it is
   * already tuned per theme to be visible without competing with content, and
   * that is exactly what a chart grid needs to be.
   */
  const grid = tokens.gridLine;

  // Labels are the dim text colour — secondary by design, and already checked
  // for contrast against the surfaces the chart sits on.
  const label = tokens.textDim;

  // The curve is the accent. It is the colour the app already uses for "this is
  // the answer", and a chart line is an answer.
  const curve = tokens.accent;

  /*
   * The equivalence marker and the band under the curve.
   *
   * Both are the accent at low alpha rather than the palette's `warn`: the
   * marker is not a warning, it is a second reading of the same quantity, and
   * using the warning colour made a correct titration look like something had
   * gone wrong.
   */
  return {
    grid,
    label,
    curve,
    eq: alpha(tokens.accent, 0.55),
    band: alpha(tokens.accent, 0.1),
    // Points and residuals are the same ink at full strength.
    point: tokens.accent,
    fit: tokens.ok,
    axis: tokens.borderStrong,
  };
}
