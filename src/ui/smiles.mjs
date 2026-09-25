/**
 * Molecular structure diagrams from SMILES.
 *
 * Uses SmilesDrawer (MIT, 609 stars) to turn a SMILES string into an SVG
 * structure. This is the one third-party dependency in the app that draws
 * something rather than computing something, and it earns its 193 KB: writing
 * a structure renderer means implementing ring perception, layout, wedge/hash
 * stereo bonds and label placement, which is a project in itself and would be
 * worse than the library that already does it.
 *
 * ## Why the options are set the way they are
 *
 * The default theme is a light background with black bonds. This app has six
 * palettes, four of them dark, so the drawing has to be re-themed rather than
 * drawn once and pasted. SmilesDrawer takes a `themes` object and a theme name;
 * the colours here are read from the app's own CSS custom properties at call
 * time, so a structure follows the active palette the same way every other
 * graphic does.
 *
 * Everything is vector. A structure diagram is a line drawing, and a canvas
 * would be blurry at the zoom a student uses to check a stereocentre.
 */

/*
 * Loaded dynamically, not at module scope.
 *
 * SmilesDrawer is 194 KB raw and pulls chroma-js with it, and it is needed by
 * one panel that most sessions never open. A static import puts all of it in
 * the main bundle, which every user pays for on first load whether they draw a
 * molecule or not — the app's own principle is that graphics must not cost
 * smoothness, and a structure renderer nobody asked for is exactly that.
 *
 * The promise is cached so the second molecule does not re-fetch the module.
 * `import()` already dedupes at the module-registry level, but caching the
 * resolved value here also skips the microtask hop on every redraw, and a
 * redraw happens on every keystroke in the SMILES field.
 */
let drawerPromise = null;
function loadSmilesDrawer() {
  if (!drawerPromise) drawerPromise = import('smiles-drawer').then((m) => m.default ?? m);
  return drawerPromise;
}

/** Render options: vector, theme-aware, and quiet enough to sit in a panel. */
const BASE_OPTIONS = {
  width: 320,
  height: 240,
  bondThickness: 1.1,
  bondLength: 22,
  atomVisualization: 'default',
  compactDrawing: false,
  // Explicit hydrogens are the single biggest source of visual noise in a
  // structure drawing. A chemist reads the skeleton; the H count is implied.
  explicitHydrogens: false,
  terminalCarbons: false,
  padding: 12,
};

/**
 * Read the app's palette into the shape SmilesDrawer expects.
 *
 * Called per render rather than cached: the theme can change at any moment, and
 * a cached palette would leave the previous theme's bonds on screen. Reading
 * six custom properties is not a cost worth optimising.
 */
function themeFrom(root) {
  const cs = root && typeof getComputedStyle === 'function' ? getComputedStyle(root) : null;
  const v = (name, fallback) => (cs ? cs.getPropertyValue(name).trim() : '') || fallback;
  return {
    /*
     * FOREGROUND is what SmilesDrawer paints atom labels with, and it is not
     * derived from C. Leaving it out does not fall back to C — it falls back
     * to the library's own default, white, which on a light palette is white
     * text on a near-white background. The labels vanished on Catppuccin
     * Latte and Rosé Pine Dawn while the bonds re-themed correctly, so the
     * structure looked fine at a glance and was missing its heteroatoms.
     */
    FOREGROUND: v('--text', '#eef0f4'),
    C: v('--text', '#eef0f4'),
    O: v('--err', '#ff7a7a'),
    N: v('--accent', '#5aa9ff'),
    F: v('--ok', '#45d19a'),
    CL: v('--ok', '#45d19a'),
    BR: v('--warn', '#f0b429'),
    I: v('--warn', '#f0b429'),
    P: v('--warn', '#f0b429'),
    S: v('--warn', '#f0b429'),
    B: v('--text-mid', '#b6bdcc'),
    BACKGROUND: v('--surface', '#12151d'),
  };
}

/**
 * Ring-closure digits must come in pairs.
 *
 * SmilesDrawer accepts `c1ccccc` — an unclosed ring — and returns a tree for
 * it. Drawn, that is a chain where the user asked for a ring: a *wrong*
 * structure presented with no indication anything failed, which is worse than
 * an error message. The library does not check the balance, so this does.
 *
 * A digit appearing an even number of times overall is the necessary
 * condition; the sufficient one would require tracking bond order and
 * direction, which is the parser's job and not worth reimplementing here. This
 * catches the common typo, which is the whole point.
 */
function ringDigitsBalanced(smiles) {
  const counts = new Map();
  // Strip bracket atoms first: `[C@H]` contains no digits, but `[13CH4]` does,
  // and an isotope mass number is not a ring closure.
  const bare = smiles.replace(/\[[^\]]*\]/g, '[]');
  for (const ch of bare) {
    if (ch >= '1' && ch <= '9') counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  for (const [digit, n] of counts) {
    if (n % 2 !== 0) return { ok: false, digit };
  }
  return { ok: true };
}

/**
 * Parse a SMILES string, returning null rather than throwing.
 *
 * A structure the parser cannot read is a normal thing to encounter — the user
 * mistyped, or pasted something that is not SMILES. The caller renders a
 * message; it does not need an exception, and an exception here would blank the
 * whole tab.
 */
export async function parseSmiles(smiles) {
  if (typeof smiles !== 'string' || smiles.trim() === '') return null;

  // Checked before the parser, because the parser accepts an unclosed ring.
  if (!ringDigitsBalanced(smiles).ok) return null;

  try {
    const SmilesDrawer = await loadSmilesDrawer();
    let tree = null;
    SmilesDrawer.parse(smiles, (t) => { tree = t; }, () => { tree = null; });
    return tree;
  } catch {
    return null;
  }
}

/**
 * Draw a SMILES string into an existing SVG element.
 *
 * `into` is an `<svg>` the caller owns, so React controls the element and the
 * library only fills it. The alternative — letting the library create and
 * insert the node — puts a DOM element outside React's tree, which then leaks
 * on unmount and is invisible to every render test.
 *
 * Returns true when something was drawn, false when the input could not be
 * parsed. The caller uses that to decide between the drawing and a message.
 */
export async function drawSmiles(smiles, into, themeRoot) {
  if (!into || typeof into.replaceChildren !== 'function') return false;
  const tree = await parseSmiles(smiles);
  if (!tree) return false;

  const SmilesDrawer = await loadSmilesDrawer();
  const drawer = new SmilesDrawer.SvgDrawer({
    ...BASE_OPTIONS,
    themes: { app: themeFrom(themeRoot) },
  });

  try {
    // `replaceChildren` first: without it, redrawing a structure appends a
    // second drawing beside the first, so changing the input leaves the old
    // molecule on screen next to the new one.
    into.replaceChildren();
    drawer.draw(tree, into, 'app');
    return true;
  } catch {
    into.replaceChildren();
    return false;
  }
}
