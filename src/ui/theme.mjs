/**
 * Theme: dark, light, or follow the OS.
 *
 * Three states rather than a two-way toggle, because a user who wants the app
 * to track their system setting has no way to express that with a switch that
 * only knows "dark" and "light". Cycling dark → light → system means the OS
 * preference is always reachable without clearing storage.
 *
 * The module is DOM-free apart from `applyTheme`, which takes its root as an
 * argument — that keeps everything else testable in Node.
 */

export const THEME_KEY = 'lab-calc.theme.v1';

export const THEMES = {
  dark: { zh: '深色', en: 'Dark' },
  light: { zh: '浅色', en: 'Light' },
  system: { zh: '跟随系统', en: 'System' },
};

export function detectTheme(osPrefersDark, stored) {
  if (stored && stored in THEMES) return stored;
  // An unknown preference (undefined/null) keeps dark rather than flipping to a
  // bright screen. The app is dark-first, and on an unknown platform the
  // quieter default is the safer guess.
  if (typeof osPrefersDark !== 'boolean') return 'dark';
  return osPrefersDark ? 'dark' : 'light';
}

/** Collapse "system" into the concrete theme it currently means. */
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

export function nextTheme(current) {
  const order = ['dark', 'light', 'system'];
  const i = order.indexOf(current);
  return order[(i + 1) % order.length];
}

/**
 * Write the theme onto a root element.
 *
 * Two attributes: `data-theme` is what the CSS keys off, and
 * `data-theme-resolved` records the concrete dark/light in effect so a style
 * can target it even when the preference is "system".
 */
export function applyTheme(root, resolved) {
  if (!root?.dataset) return;
  root.dataset.theme = resolved;
  root.dataset.themeResolved = resolved;
  if (root.style && typeof root.style.setProperty === 'function') {
    // Keep the mobile browser chrome in step with the page background.
    root.style.setProperty('color-scheme', resolved);
  }
}
