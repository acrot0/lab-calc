/**
 * Interface density — the third appearance axis.
 *
 * Theme chooses colour, material chooses how surfaces transmit light, icon
 * style chooses how glyphs are drawn, and density chooses how much space the
 * interface takes. All four are independent preferences.
 *
 * ## Why density is not just a font size
 *
 * Scaling text alone breaks a layout: padding, gaps, control heights and the
 * type ramp all have to move together, or a compact mode produces cramped
 * controls with generous gaps. So density scales the *whole* spacing and type
 * scale, by overriding the tokens the rest of the stylesheet already reads.
 *
 * That is the payoff of having tokenised spacing from the start: `--s1` through
 * `--s10` and `--t-xs` through `--t-xl` are the only things that change, and
 * every rule that uses them follows without being touched.
 *
 * ## Why the scale is a multiplier and not a second token table
 *
 * Two hand-written tables would drift — a new spacing step added to one and not
 * the other, and compact mode silently loses it. A multiplier cannot drift: it
 * applies to whatever the base scale is.
 *
 * ## The floors matter
 *
 * `--t-xs` is 11.5px at comfortable density. At 0.9 that is 10.35px, which is
 * below the size at which the CJK glyphs in this app stay legible on a
 * low-DPI screen. So the type scale has a floor and the spacing scale does not:
 * running out of space is a layout problem, and running out of legibility is a
 * correctness one. The numbers are chosen so the floor is never reached by the
 * multipliers offered — it is a guard against a future multiplier, not a
 * clamp that is doing work today.
 */

/** The densities, in the order a toggle cycles them. */
export const DENSITIES = ['comfortable', 'compact', 'spacious'];

export const DEFAULT_DENSITY = 'comfortable';

const DENSITY_KEY = 'lab-calc.density.v1';

/**
 * The multiplier each density applies to the spacing and type scales.
 *
 * `spacious` is below 1.2 deliberately: past that the fifteen tab labels stop
 * fitting a desktop row and the navigation wraps, which is a worse trade than
 * the extra room buys.
 */
export const DENSITY_SCALE = {
  comfortable: { space: 1, type: 1 },
  compact: { space: 0.8, type: 0.94 },
  spacious: { space: 1.18, type: 1.04 },
};

/**
 * The smallest a type token may become, in px, at any density.
 *
 * 11px is the floor for the 11.5px body-small token: below it the CJK
 * ideographs this app renders lose their internal strokes on a low-DPI screen.
 */
export const MIN_TYPE_PX = 11;

/** Anything unrecognised resolves to the default rather than to no density. */
export function detectDensity(stored) {
  return DENSITIES.includes(stored) ? stored : DEFAULT_DENSITY;
}

export function loadDensity(store) {
  try {
    return detectDensity(store?.getItem(DENSITY_KEY) ?? null);
  } catch {
    return DEFAULT_DENSITY;
  }
}

export function saveDensity(store, density) {
  try {
    store?.setItem(DENSITY_KEY, density);
    return true;
  } catch {
    return false;
  }
}

/** The density a toggle click should move to. */
export function nextDensity(current) {
  const i = DENSITIES.indexOf(detectDensity(current));
  return DENSITIES[(i + 1) % DENSITIES.length];
}

/**
 * Publish the choice on the document element.
 *
 * The multiplier is published as custom properties rather than applied by
 * multiplying every token in JavaScript. CSS does the arithmetic with `calc()`,
 * so the base scale stays the single source and a token added later is scaled
 * automatically.
 */
export function applyDensity(root, density) {
  if (!root?.dataset || !root.style) return;
  const d = detectDensity(density);
  const { space, type } = DENSITY_SCALE[d];
  root.dataset.density = d;
  root.style.setProperty('--density-space', String(space));
  root.style.setProperty('--density-type', String(type));
}
