/**
 * Icon style — the third appearance axis, orthogonal to theme and material.
 *
 * Theme chooses colour, material chooses how surfaces transmit light, and this
 * chooses how glyphs are drawn. The three are independent: every combination
 * has to be legible, so none of them may assume anything about the others.
 *
 * ## Why three styles and not six
 *
 * Phosphor ships six weights, and all six are reachable through `Icons`. But a
 * *user-facing* setting is not the same as the full range — offering six makes
 * the choice a puzzle, and four of the six differ so little at 16px that the
 * user cannot tell which one they picked. These three are the ones that read
 * as genuinely different things at the sizes this app draws at:
 *
 *   - `linear`  — outline only. The lightest, and the default because it is
 *     what the interface was designed against.
 *   - `filled`  — solid. Heaviest, and the clearest at very small sizes where
 *     an outline stroke fills in.
 *   - `duotone` — a two-tone glyph. The most decorative; useful when the icons
 *     are carrying the visual weight of a section rather than labelling it.
 *
 * The mapping is deliberately not one-to-one with Phosphor's weight names:
 * `linear` is `regular`, not `thin`, because `thin` at 16px is a hairline that
 * disappears on a low-DPI screen — a style a user can select but cannot see is
 * a broken option, not a choice.
 */

/** The three styles, in the order a toggle cycles them. */
const ICON_STYLES = ['linear', 'filled', 'duotone'];

export const DEFAULT_ICON_STYLE = 'linear';

const ICON_STYLE_KEY = 'lab-calc.iconStyle.v1';

/**
 * Which Phosphor weight each style draws with.
 *
 * Kept as a table rather than a ternary at the call site so a style can be
 * remapped without hunting for the places it is read.
 */
export const STYLE_WEIGHT = {
  linear: 'regular',
  filled: 'fill',
  duotone: 'duotone',
};

/** Anything unrecognised resolves to the default rather than to no style. */
function detectIconStyle(stored) {
  return ICON_STYLES.includes(stored) ? stored : DEFAULT_ICON_STYLE;
}

export function loadIconStyle(store) {
  try {
    return detectIconStyle(store?.getItem(ICON_STYLE_KEY) ?? null);
  } catch {
    return DEFAULT_ICON_STYLE;
  }
}

export function saveIconStyle(store, style) {
  try {
    store?.setItem(ICON_STYLE_KEY, style);
    return true;
  } catch {
    return false;
  }
}

/** The style a toggle click should move to. */
export function nextIconStyle(current) {
  const i = ICON_STYLES.indexOf(detectIconStyle(current));
  return ICON_STYLES[(i + 1) % ICON_STYLES.length];
}

/**
 * Publish the choice on the document element, where the stylesheet reads it.
 *
 * A data attribute for the same reason the material uses one: it is
 * self-describing in the inspector, and CSS can match it without the
 * specificity puzzles a boolean class invites.
 */
export function applyIconStyle(root, style) {
  if (!root?.dataset) return;
  root.dataset.iconStyle = detectIconStyle(style);
}
