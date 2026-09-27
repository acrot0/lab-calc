/**
 * User overrides on top of a palette.
 *
 * ## Why this exists
 *
 * The complaint was 「主题很多但同汤不同碗，没有自定义空间」 — eleven palettes
 * are eleven colour sets, and a user who wants the accent from one, sharper
 * corners and less motion has no way to say so. The only route was forking.
 *
 * ## Why overrides rather than a custom theme
 *
 * An override is applied *on top of* a palette, so every palette keeps working
 * and a user who customises nothing sees exactly what they saw before. A custom
 * theme that replaced the palette would have to re-specify every token, and the
 * first one missed renders as an unstyled element. It would also throw away the
 * contrast work: the palette tests check every text/surface pairing, and a
 * theme with its own `--text` has nothing to check against.
 *
 * ## Why the key list is fixed and short
 *
 * `--surface-2` and `--text-dim` are load-bearing for legibility. A user able
 * to set any token could produce unreadable text on a surface, and the guard
 * that would catch it only knows about palette values. The exposed set is the
 * one where *every* value is safe: an accent (which is checked against the
 * surfaces it appears on), and three enumerated scales — radius, density,
 * motion — where the user picks a named step rather than a number.
 *
 * The step list is also why this is not a slider: a corner radius of 7px is a
 * mistake, not a preference, and offering it invites the user to make it.
 *
 * ## What is not here
 *
 * The editor UI. The plan puts it in P2; this module is the model it will
 * drive, plus the JSON export and import that make a customisation shareable.
 *
 * Pure functions apart from the two store helpers.
 */

import { shiftLightness, darkenHex, alpha } from './palettes.mjs';

/** Where the overrides live. Versioned like the other keys, for the same reason. */
export const CUSTOM_KEY = 'lab-calc.custom.v1';

/*
 * The export format, so an import can tell a theme from a history bundle — a
 * history bundle is JSON too, and importing one as a theme should say so rather
 * than silently applying nothing. Not exported: the version is this module's
 * own business, and a caller that needs to know reads it from the file.
 */
const THEME_FORMAT = 'lab-calc.theme';
const THEME_VERSION = 1;

/**
 * The tokens a user may set.
 *
 * `--accent` is here because the palette guard checks the accent against every
 * surface it is drawn on, so the same check can be applied to a user's colour.
 * The three scales are here because their values are chosen from a list.
 *
 * Deliberately absent, and each for the same reason — the guard cannot check
 * them: `--text`, `--text-mid`, `--text-dim`, `--surface*`, `--border*`,
 * `--bg*`, and the status colours.
 */
export const OVERRIDE_KEYS = ['--accent', '--radius', '--density', '--motion'];

/**
 * Corner radius, in the three steps a designer would offer.
 *
 * The default matches the stylesheet's own values, so choosing it is the same
 * as choosing nothing — which is what makes "reset" a step rather than a
 * separate control.
 */
export const RADIUS_STEPS = [
  { id: 'sharp', label: { zh: '直角', en: 'Sharp' }, rSm: '2px', rMd: '4px', rLg: '6px' },
  { id: 'default', label: { zh: '标准', en: 'Default' }, rSm: '6px', rMd: '10px', rLg: '14px' },
  { id: 'round', label: { zh: '圆角', en: 'Round' }, rSm: '10px', rMd: '16px', rLg: '24px' },
];

/** Spacing and type scale, adjusted together — the stylesheet's own note says
 *  the two move as one, and a compact density with large type is unreadable. */
export const DENSITY_STEPS = [
  {
    id: 'compact',
    label: { zh: '紧凑', en: 'Compact' },
    s: { 1: '3px', 2: '5px', 3: '8px', 4: '12px', 5: '16px', 6: '22px' },
    t: { xs: '10.5px', sm: '12px', md: '14px', lg: '16px' },
  },
  {
    id: 'default',
    label: { zh: '标准', en: 'Default' },
    s: { 1: '4px', 2: '7px', 3: '11px', 4: '16px', 5: '22px', 6: '30px' },
    t: { xs: '11.5px', sm: '13px', md: '15px', lg: '18px' },
  },
  {
    id: 'spacious',
    label: { zh: '宽松', en: 'Spacious' },
    s: { 1: '5px', 2: '9px', 3: '14px', 4: '21px', 5: '28px', 6: '38px' },
    t: { xs: '12.5px', sm: '14px', md: '16.5px', lg: '20px' },
  },
];

/**
 * Motion intensity.
 *
 * `reduced` collapses the durations to a millisecond rather than removing the
 * transitions, so an element still reaches its end state — a transition of 1ms
 * is a jump, and a *removed* transition can leave a property unset. This is the
 * same thing `prefers-reduced-motion` does in the stylesheet, offered as a
 * choice rather than only as a system setting.
 */
export const MOTION_STEPS = [
  {
    id: 'reduced',
    label: { zh: '弱', en: 'Reduced' },
    moveS: '1ms', moveM: '1ms', moveL: '1ms', fxS: '1ms', fxM: '1ms', fxL: '1ms',
  },
  {
    id: 'default',
    label: { zh: '标准', en: 'Default' },
    moveS: '350ms', moveM: '500ms', moveL: '650ms', fxS: '120ms', fxM: '200ms', fxL: '300ms',
  },
  {
    id: 'expressive',
    label: { zh: '强', en: 'Expressive' },
    moveS: '450ms', moveM: '620ms', moveL: '800ms', fxS: '160ms', fxM: '260ms', fxL: '380ms',
  },
];

const STEP_SETS = { '--radius': RADIUS_STEPS, '--density': DENSITY_STEPS, '--motion': MOTION_STEPS };

/**
 * Whether a value is a colour a CSS property can hold.
 *
 * The check is a shape check, not a parser: `#rgb`, `#rrggbb`, `#rrggbbaa`,
 * and the three functional forms a colour input can produce. Anything else is
 * refused rather than escaped, because the value goes into a custom property
 * and a custom property accepts *anything* — including `red; background:
 * url(...)`, which is not a colour and would be a way to inject a declaration.
 */
function isColour(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) return true;
  if (/^#[0-9a-f]{6}$/i.test(s)) return true;
  if (/^#[0-9a-f]{8}$/i.test(s)) return true;
  if (/^rgba?\(\s*[\d.\s,%]+\)$/i.test(s)) return true;
  if (/^hsla?\(\s*[\d.\s,%deg]+\)$/i.test(s)) return true;
  return false;
}

/** No overrides. */
export function emptyOverrides() {
  return {};
}

/** Whether anything is customised — the settings row reads this. */
export function isCustomised(overrides) {
  return overrideCount(overrides) > 0;
}

/** How many tokens are overridden. */
export function overrideCount(overrides) {
  return Object.keys(overrides ?? {}).length;
}

/**
 * Set one override, validating first.
 *
 * An invalid key or value leaves the set unchanged rather than throwing: this
 * is driven by a colour input and a set of buttons, and a bad value there is a
 * mistake rather than a programming error. Returning the input unchanged means
 * the caller's state stays consistent either way.
 */
export function withOverride(overrides, key, value) {
  const base = overrides ?? {};
  if (!OVERRIDE_KEYS.includes(key)) return base;
  const stepSet = STEP_SETS[key];
  if (stepSet) {
    if (!stepSet.some((s) => s.id === value)) return base;
    // Choosing the default is the same as not choosing — see RADIUS_STEPS.
    if (value === 'default') return clearOverride(base, key);
    return { ...base, [key]: value };
  }
  if (!isColour(value)) return base;
  return { ...base, [key]: value.trim() };
}

/** Remove one override. */
export function clearOverride(overrides, key) {
  const base = overrides ?? {};
  if (!(key in base)) return base;
  const { [key]: _drop, ...rest } = base;
  return rest;
}

/**
 * Clean a stored or imported set.
 *
 * Everything that reaches the DOM goes through here: a key that is not exposed
 * is dropped rather than applied, and a value that is not a colour or a known
 * step id is dropped with it. A hand-edited file is the expected input.
 */
export function migrateOverrides(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!OVERRIDE_KEYS.includes(key)) continue;
    const stepSet = STEP_SETS[key];
    if (stepSet) {
      if (stepSet.some((s) => s.id === value) && value !== 'default') out[key] = value;
      continue;
    }
    if (isColour(value)) out[key] = String(value).trim();
  }
  return out;
}

/** Read the overrides. Never throws: a corrupt value reads as no overrides. */
export function loadOverrides(store) {
  try {
    return migrateOverrides(JSON.parse(store.getItem(CUSTOM_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

/** Persist the overrides. Returns false when the store refused the write. */
export function saveOverrides(store, overrides) {
  try {
    store.setItem(CUSTOM_KEY, JSON.stringify(migrateOverrides(overrides)));
    return true;
  } catch {
    return false;
  }
}

/**
 * The CSS variables an override set resolves to.
 *
 * ## Why the accent is derived rather than set alone
 *
 * A palette derives six tokens from its own accent: the two hover colours, the
 * gradient's dark end, and the soft/line alphas. Setting only `--accent` would
 * change the button and leave its hover on the old hue — the kind of
 * half-applied change that looks like a bug. So an accent override derives the
 * same six, using the same helpers the palette uses, so the relationship
 * between them is the palette's own rather than a second one invented here.
 *
 * `--accent-ink` is the exception: it is the text colour drawn *on* a filled
 * accent button, and the palettes pick it as a fixed light or dark value rather
 * than deriving it. Keeping the palette's is correct — a user who picks a pale
 * yellow accent still gets the palette's dark ink, which is what legibility
 * requires. Deriving it from the accent would need a luminance test, and
 * getting that wrong produces white-on-yellow.
 *
 * The scales map straight through. Every emitted name is one the stylesheet
 * already defines; a typo would set a variable nothing reads and the setting
 * would silently do nothing, which is why the test asserts the name set.
 */
export function resolveOverrides(overrides, scheme = 'dark') {
  const o = migrateOverrides(overrides);
  const out = {};

  if (o['--accent']) {
    const accent = o['--accent'];
    out['--accent'] = accent;
    // Same derivation as the palette's own, so the hue cannot drift.
    out['--accent-hover'] = shiftLightness(accent, scheme === 'dark' ? 0.14 : -0.16);
    out['--accent-hover-solid'] = shiftLightness(accent, scheme === 'dark' ? 0.14 : -0.16);
    out['--brand-deep'] = darkenHex(accent, scheme === 'dark' ? 0.28 : 0.34);
    out['--accent-soft'] = alpha(accent, 0.12);
    out['--accent-line'] = alpha(accent, 0.35);
  }

  const radius = RADIUS_STEPS.find((s) => s.id === o['--radius']);
  if (radius) {
    out['--r-sm'] = radius.rSm;
    out['--r-md'] = radius.rMd;
    out['--r-lg'] = radius.rLg;
  }

  const density = DENSITY_STEPS.find((s) => s.id === o['--density']);
  if (density) {
    for (const [n, v] of Object.entries(density.s)) out[`--s${n}`] = v;
    for (const [n, v] of Object.entries(density.t)) out[`--t-${n}`] = v;
  }

  const motion = MOTION_STEPS.find((s) => s.id === o['--motion']);
  if (motion) {
    out['--dur-move-s'] = motion.moveS;
    out['--dur-move-m'] = motion.moveM;
    out['--dur-move-l'] = motion.moveL;
    out['--dur-fx-s'] = motion.fxS;
    out['--dur-fx-m'] = motion.fxM;
    out['--dur-fx-l'] = motion.fxL;
  }

  return out;
}

/**
 * The overrides as a shareable document.
 *
 * The palette is recorded alongside them, because an override set is only
 * meaningful against a base: an accent chosen to sit on Catppuccin Mocha can be
 * illegible on Solarized Light. Importing it onto a different palette is
 * allowed — the user may know what they are doing — but the file says which one
 * it was designed against.
 */
export function overridesToJson(overrides, { palette = null, now = new Date() } = {}) {
  return JSON.stringify({
    format: THEME_FORMAT,
    version: THEME_VERSION,
    palette,
    exportedAt: now.toISOString(),
    overrides: migrateOverrides(overrides),
  }, null, 2);
}

/**
 * Parse a shared theme.
 *
 * Returns a result object rather than throwing, and each failure has its own
 * code: a file that is not JSON, a file that is JSON but not a theme (a history
 * bundle is both), a file from a newer version, and a file with nothing in it.
 * The caller needs the difference to say which file to pick instead.
 */
export function overridesFromJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, code: 'notJson', overrides: {}, palette: null };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, code: 'notTheme', overrides: {}, palette: null };
  }
  if (data.format !== THEME_FORMAT) {
    return { ok: false, code: 'notTheme', overrides: {}, palette: null };
  }
  if (!Number.isInteger(data.version) || data.version < 1) {
    return { ok: false, code: 'badVersion', overrides: {}, palette: null };
  }
  if (data.version > THEME_VERSION) {
    // Fail loudly rather than importing a subset: a newer file may carry tokens
    // this build would silently drop, and a half-applied theme is worse than a
    // refusal.
    return { ok: false, code: 'newerVersion', overrides: {}, palette: null };
  }
  const overrides = migrateOverrides(data.overrides);
  if (Object.keys(overrides).length === 0) {
    return { ok: false, code: 'empty', overrides: {}, palette: null };
  }
  const palette = typeof data.palette === 'string' && data.palette in PALETTES
    ? data.palette
    : null;
  return { ok: true, code: null, overrides, palette };
}

/**
 * A short description of what is customised, for the settings row.
 *
 * A row that says "custom" tells the user nothing about whether to open it; one
 * that says "accent, corners" tells them what they changed and, by omission,
 * what they did not.
 */
export function describeOverrides(overrides, locale = 'zh') {
  const o = migrateOverrides(overrides);
  const labels = [];
  const names = {
    '--accent': { zh: '强调色', en: 'Accent' },
    '--radius': { zh: '圆角', en: 'Corners' },
    '--density': { zh: '密度', en: 'Density' },
    '--motion': { zh: '动效', en: 'Motion' },
  };
  for (const key of OVERRIDE_KEYS) {
    if (!(key in o)) continue;
    const stepSet = STEP_SETS[key];
    if (stepSet) {
      const step = stepSet.find((s) => s.id === o[key]);
      const name = names[key][locale] ?? names[key].zh;
      const stepLabel = step?.label?.[locale] ?? step?.label?.zh ?? o[key];
      labels.push(`${name}: ${stepLabel}`);
    } else {
      labels.push(names[key][locale] ?? names[key].zh);
    }
  }
  return { count: labels.length, labels };
}
