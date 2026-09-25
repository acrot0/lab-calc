/**
 * The surface material — frosted glass or solid.
 *
 * Kept separate from theme.mjs because the two are orthogonal: a material is
 * how a surface transmits light, a theme is what colour it is, and every
 * combination of the six palettes and the two materials has to be legible. A
 * user on Catppuccin Latte can choose frosted glass just as one on Mocha can
 * choose solid.
 *
 * Frosted means a translucent background plus a backdrop blur. Both halves are
 * needed: translucency alone over a gradient background reads as a rendering
 * fault, and a blur alone over an opaque background does nothing at all. The
 * blur is also what makes the translucency safe — text sitting on a blurred
 * backdrop keeps its contrast, whereas text on an unblurred translucent panel
 * takes whatever colour happens to be behind it.
 *
 * Only chrome is frosted: the navigation rail, the topbar, and the overlay
 * scrims. Content cards stay opaque. The project's six palettes were each
 * contrast-checked against the card surface, and a translucent card would put
 * body text over the page gradient, invalidating that check for every theme at
 * once. Frosting the chrome costs nothing legible and is where the effect
 * actually reads as depth — panels floating over the content they navigate.
 */

/** The two materials, in the order a toggle should cycle them. */
export const MATERIALS = ['frosted', 'solid'];

export const DEFAULT_MATERIAL = 'frosted';

export const MATERIAL_KEY = 'lab-calc.material.v1';

/** Anything unrecognised resolves to the default rather than to no material. */
export function detectMaterial(stored) {
  return MATERIALS.includes(stored) ? stored : DEFAULT_MATERIAL;
}

export function loadMaterial(store) {
  try {
    return detectMaterial(store?.getItem(MATERIAL_KEY) ?? null);
  } catch {
    return DEFAULT_MATERIAL;
  }
}

export function saveMaterial(store, material) {
  try {
    store?.setItem(MATERIAL_KEY, material);
    return true;
  } catch {
    return false;
  }
}

/** The material a toggle click should move to. */
export function nextMaterial(current) {
  const i = MATERIALS.indexOf(detectMaterial(current));
  return MATERIALS[(i + 1) % MATERIALS.length];
}

/**
 * Publish the choice on the document element, where the stylesheet reads it.
 *
 * A data attribute rather than a class: `data-material="frosted"` is
 * self-describing in the inspector, and the CSS can match
 * `[data-material="frosted"]` without the specificity puzzles a boolean class
 * invites.
 */
export function applyMaterial(root, material) {
  if (!root?.dataset) return;
  root.dataset.material = detectMaterial(material);
}

/**
 * Whether to ask the browser to reduce transparency.
 *
 * `prefers-reduced-transparency` is the OS-level "reduce transparency" switch.
 * It is reported separately from `prefers-reduced-motion`, so a user who wants
 * solid surfaces but still wants animations gets both honoured. Support is
 * still thin, hence the fallback to false — an unsupported query must not
 * silently switch everyone to solid.
 */
export function prefersSolid(win = globalThis) {
  if (typeof win?.matchMedia !== 'function') return false;
  try {
    return win.matchMedia('(prefers-reduced-transparency: reduce)').matches;
  } catch {
    return false;
  }
}
