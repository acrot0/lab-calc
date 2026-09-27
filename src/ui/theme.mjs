/**
 * Theme selection: which palette is in effect, and whether it follows the OS.
 *
 * Six concrete palettes plus a "system" preference. The palettes themselves
 * live in `palettes.mjs`, read from the upstream packages; this module only
 * decides which one is active and writes it to the DOM.
 *
 * The module is DOM-free apart from `applyTheme`, which takes its root as an
 * argument — that keeps everything else testable in Node.
 */

import { PALETTES, PALETTE_KEYS, paletteOf, cssVariables } from './palettes.mjs';
import { resolveOverrides } from './custom-theme.mjs';

export const THEME_KEY = 'lab-calc.theme.v2';

/**
 * The theme names, derived from the palette registry.
 *
 * `dark` and `light` keep their meaning, and `system` is a preference rather
 * than a palette — it resolves to whichever of the two the OS reports. Without
 * it, a user who wants the app to follow their system setting has no way to
 * say so, because a picker that only lists palettes has no "follow the system"
 * option.
 */
export const THEMES = {
  system: { zh: '跟随系统', en: 'System' },
  ...Object.fromEntries(
    PALETTE_KEYS.map((key) => [key, PALETTES[key].label]),
  ),
};

/** The concrete palettes, i.e. everything except the `system` preference. */
export const CONCRETE_THEMES = PALETTE_KEYS;

/** Themes grouped for the picker: the OS preference, then the dark and light sets. */
export const THEME_GROUPS = [
  { id: 'system', keys: ['system'] },
  { id: 'dark', keys: PALETTE_KEYS.filter((k) => PALETTES[k].scheme === 'dark') },
  { id: 'light', keys: PALETTE_KEYS.filter((k) => PALETTES[k].scheme === 'light') },
];

export function detectTheme(osPrefersDark, stored) {
  if (stored && stored in THEMES) return stored;
  // An unknown preference (undefined/null) keeps dark rather than flipping to a
  // bright screen. The app is dark-first, and on an unknown platform the
  // quieter default is the safer guess.
  if (typeof osPrefersDark !== 'boolean') return 'dark';
  return osPrefersDark ? 'dark' : 'light';
}

/**
 * Collapse "system" into the concrete palette it currently means.
 *
 * A stored palette key that has since been removed from the registry falls
 * back to the OS preference rather than to a fixed theme, because a user whose
 * chosen theme disappeared has not expressed a preference between dark and
 * light — they expressed one for a palette that is gone.
 */
export function resolveTheme(preference, osPrefersDark) {
  if (preference === 'system' || !(preference in THEMES)) {
    return osPrefersDark ? 'dark' : 'light';
  }
  return preference;
}

export function loadTheme(store) {
  try {
    return store?.getItem(THEME_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveTheme(store, theme) {
  try {
    store?.setItem(THEME_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

/** Cycle to the next theme. Kept for the keyboard shortcut; the UI uses a list. */
export function nextTheme(current) {
  const order = ['system', ...PALETTE_KEYS];
  const i = order.indexOf(current);
  return order[(i + 1) % order.length];
}

/**
 * Write a palette onto a root element.
 *
 * Two attributes: `data-theme` is the concrete palette key, which the CSS uses
 * for the handful of rules that cannot be expressed as a custom property, and
 * `data-theme-pref` records the user's actual choice so the picker can show
 * "System" as selected while a concrete palette is in effect.
 *
 * The custom properties are set inline rather than by swapping stylesheets.
 * Inline properties are one write, they win over any stylesheet rule, and they
 * make the active palette readable from the DOM — which is how the visual
 * tests confirm the theme actually applied rather than assuming it did.
 */
export function applyTheme(root, resolved, preference = resolved, overrides = null) {
  if (!root?.dataset) return;
  const palette = paletteOf(resolved);
  root.dataset.theme = resolved;
  root.dataset.themeResolved = resolved;
  root.dataset.themePref = preference;
  root.dataset.themeScheme = palette.scheme;

  if (root.style && typeof root.style.setProperty === 'function') {
    for (const [name, value] of Object.entries(cssVariables(resolved))) {
      root.style.setProperty(name, value);
    }
    /*
     * The user's overrides go on last, so they win.
     *
     * Applied after the palette rather than merged into it: an override is a
     * layer, and a user who switches palette keeps their customisation — the
     * accent they chose stays chosen. The alternative (writing overrides into
     * the palette's token object) would lose them on the next palette switch,
     * because `cssVariables` rebuilds from the palette each time.
     *
     * ## Removing the previous override, not the current one
     *
     * A token an override set has to be removed when the user clears it,
     * otherwise the old value stays in the inline style and reset appears to do
     * nothing. The first version removed every token an override *could* set
     * that the current set does not contain — which also removed the tokens the
     * palette had just written, because `--accent` and `--r-*` are among them.
     * Measured: with no overrides at all, `--accent` was absent from the inline
     * style and the app rendered with the stylesheet's fallback colour.
     *
     * So the removal is driven by what the *previous* application wrote, which
     * is tracked on the root rather than guessed from the current set.
     */
    const custom = resolveOverrides(overrides, palette.scheme);
    for (const name of root.__customTokens ?? []) {
      if (!(name in custom)) root.style.removeProperty(name);
    }
    for (const [name, value] of Object.entries(custom)) {
      root.style.setProperty(name, value);
    }
    /*
     * What this call set, for the next one to clean up.
     *
     * Stored on the root as a plain property rather than in a module-level
     * variable: there is one root per document, but a module variable would be
     * shared across every `applyTheme` call including the ones in tests, and a
     * test that applied to one fake root would leave state for the next.
     */
    root.__customTokens = Object.keys(custom);
    // Keep the mobile browser chrome, scrollbars and form controls in step
    // with the palette. `color-scheme` is what the browser reads for those;
    // it is not derivable from the background colour.
    root.style.setProperty('color-scheme', palette.scheme);
  }
}

/**
 * The palette's own colours for a `<meta name="theme-color">` update.
 *
 * The browser chrome on Android is painted from this, so leaving it at the
 * build-time default means a Catppuccin theme still has a blue-black status
 * bar.
 */
export function chromeColor(resolved) {
  return paletteOf(resolved).tokens.bg;
}
