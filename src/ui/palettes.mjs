/**
 * Theme palettes, read from the upstream packages rather than transcribed.
 *
 * Every colour here comes from the official package for its theme:
 * `@catppuccin/palette` and `@rose-pine/palette`, both MIT. Copying hex values
 * into this file would have been fewer lines and would have drifted the first
 * time an upstream palette was revised — and a theme that is *almost* Catppuccin
 * Mocha is worse than one that is plainly this app's own, because the label
 * makes a promise the colours do not keep.
 *
 * ## What was rejected, and why
 *
 * Nord is a popular theme and its npm package is
 * `(Apache-2.0 AND CC-BY-SA-4.0)`. CC-BY-SA is share-alike: it would attach
 * that term to this distribution, which ships under MIT. `check-licences.mjs`
 * refuses it, correctly. It is not here.
 *
 * Tokyo Night has no authoritative package — only third-party ports, each
 * carrying its own hand-transcribed hex values. Without a source of truth to
 * read from, shipping it would mean inventing colours and labelling them
 * "Tokyo Night", which is the thing this file exists to avoid.
 *
 * ## Contrast
 *
 * These are editor themes. An editor puts 13px monospace on a flat background
 * and its authors tune for that; a web app puts body text on three different
 * surface levels and needs 4.5:1 on the lightest of them. So none of these
 * values is used raw as a text colour without being checked — `contrast.test`
 * measures every pairing this app actually renders, and the few that failed
 * were darkened until they passed. The deviations are marked `derived` below
 * with the measurement that forced them.
 */

import { flavors } from '@catppuccin/palette';
import { roleColors } from '@rose-pine/palette';

/** `#eff1f5` from the package's `hex` field, which has no leading hash. */
const hash = (hex) => (hex.startsWith('#') ? hex : `#${hex}`);

const cp = (flavor, role) => hash(flavors[flavor].colors[role].hex);
const rp = (variant, role) => hash(roleColors[role][variant].hex);

/** rgba() from a hex, for the soft/line variants. */
export function alpha(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * A hex colour darkened toward black, for derived tokens.
 *
 * Toward black rather than toward the palette's text colour, which was the
 * first attempt and was wrong in a way worth recording: on a dark palette the
 * text is near-white, so mixing toward it *lightened* the accent — the gradient
 * ran from blue to a paler blue and read as a highlight rather than as depth.
 * Toward black it darkens on every palette, which is what a gradient's far end
 * is for.
 *
 * Linear in sRGB, which is not perceptually even — a 30% step is a bigger
 * visual change on a dark colour than on a light one. Close enough for a
 * gradient stop, and exactness here would mean a colour-space conversion for
 * one token.
 */
function darkenHex(hex, t) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const to2 = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${ch.map((c) => to2(c * (1 - t))).join('')}`;
}

/**
 * A hex colour moved toward white or black, preserving its hue.
 *
 * This exists because `accentHover` was doing two jobs and only one of them
 * wanted a different colour. The community palettes set it to a *companion*
 * role — Rosé Pine's accent is `foam` and its "hover" was `iris` — which is
 * exactly right for the brand wordmark, where the gradient's far end should be
 * a neighbouring hue. It is wrong for a button, where a hover that changes hue
 * reads as the control changing meaning rather than responding to the pointer.
 * Measured on the six palettes, that mistake moved the hue by up to 78°:
 * Rosé Pine Dawn's teal button turned purple under the cursor.
 *
 * So the two jobs get two tokens. `accentHover` keeps the companion hue and
 * stays the gradient's far end; `accentHoverSolid` is derived here, same hue,
 * one step of lightness away from the accent — which is what a hover on a
 * filled control should be.
 *
 * The direction follows the scheme: a light accent on a dark palette has to
 * get lighter to read as "raised", and a dark accent on a light palette has to
 * get darker. Mixing toward the scheme's own text colour would have done this
 * automatically, but it is the wrong model — it inverts on a dark palette (as
 * `darkenHex` above records) and it desaturates as it goes.
 */
function shiftLightness(hex, t) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const to2 = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  const target = t < 0 ? 0 : 255;
  const k = Math.abs(t);
  return `#${ch.map((c) => to2(c + (target - c) * k)).join('')}`;
}

/**
 * The theme list, in the order the picker shows them.
 *
 * `scheme` is what gets written to `color-scheme`, which is what makes the
 * browser draw scrollbars and form controls to match. It is not derivable from
 * the background colour, so it is stated.
 */
export const PALETTES = {
  dark: {
    label: { zh: '深色', en: 'Dark' },
    scheme: 'dark',
    tokens: {
      bg: '#0b0d12',
      bgGrad: 'radial-gradient(1200px 600px at 15% -10%, #16203a 0%, transparent 60%)',
      surface: '#12151d',
      surface2: '#171b25',
      surface3: '#1d222e',
      border: '#262c3a',
      borderStrong: '#333b4d',
      text: '#eef0f4',
      textMid: '#b6bdcc',
      // #7d8697 measured 4.34:1 on --surface-3, under the 4.5:1 floor for
      // 11.5px text. This was a pre-existing defect in the shipped dark theme,
      // found by the contrast test added with the other palettes.
      textDim: '#858d9d',
      accent: '#5aa9ff',
      accentHover: '#7cbbff',
      accentInk: '#04121f',
      ok: '#45d19a',
      warn: '#f0b429',
      warnInk: '#f7d488',
      err: '#ff7a7a',
      errInk: '#ffabab',
      gridLine: 'rgba(255, 255, 255, 0.07)',
      shadow: 'dark',
    },
  },

  light: {
    label: { zh: '浅色', en: 'Light' },
    scheme: 'light',
    tokens: {
      bg: '#f6f7fa',
      bgGrad: 'radial-gradient(1200px 600px at 15% -10%, #e2ebff 0%, transparent 60%)',
      surface: '#ffffff',
      surface2: '#f3f5f9',
      surface3: '#e9edf4',
      border: '#dfe4ed',
      borderStrong: '#c4ccda',
      text: '#131722',
      textMid: '#414a5c',
      // Darkened from #6b7688, which measured 3.91:1 on --surface-3.
      textDim: '#5a6577',
      accent: '#1f6feb',
      accentHover: '#175bc4',
      accentInk: '#ffffff',
      ok: '#128a5b',
      warn: '#a56a00',
      warnInk: '#7a5100',
      err: '#c92a2a',
      errInk: '#a01f1f',
      gridLine: 'rgba(16, 24, 40, 0.07)',
      shadow: 'light',
    },
  },

  /* --- Catppuccin ------------------------------------------------------- */

  'catppuccin-mocha': {
    label: { zh: 'Catppuccin 摩卡', en: 'Catppuccin Mocha' },
    scheme: 'dark',
    credit: 'Catppuccin (MIT)',
    tokens: {
      bg: cp('mocha', 'crust'),            // #11111b
      bgGrad: `radial-gradient(1200px 600px at 15% -10%, ${alpha(cp('mocha', 'mauve'), 0.16)} 0%, transparent 60%)`,
      surface: cp('mocha', 'mantle'),      // #181825
      surface2: cp('mocha', 'base'),       // #1e1e2e
      surface3: cp('mocha', 'surface0'),   // #313244
      border: cp('mocha', 'surface0'),     // #313244
      borderStrong: cp('mocha', 'surface1'), // #45475a
      text: cp('mocha', 'text'),           // #cdd6f4
      textMid: cp('mocha', 'subtext1'),    // #bac2de
      textDim: cp('mocha', 'subtext0'),    // #a6adc8
      accent: cp('mocha', 'blue'),         // #89b4fa
      accentHover: cp('mocha', 'lavender'), // #b4befe
      accentInk: cp('mocha', 'crust'),
      ok: cp('mocha', 'green'),            // #a6e3a1
      warn: cp('mocha', 'yellow'),         // #f9e2af
      warnInk: cp('mocha', 'yellow'),
      err: cp('mocha', 'red'),             // #f38ba8
      errInk: cp('mocha', 'maroon'),       // #eba0ac
      gridLine: alpha(cp('mocha', 'text'), 0.08),
      shadow: 'dark',
    },
  },

  'catppuccin-latte': {
    label: { zh: 'Catppuccin 拿铁', en: 'Catppuccin Latte' },
    scheme: 'light',
    credit: 'Catppuccin (MIT)',
    tokens: {
      bg: cp('latte', 'mantle'),           // #e6e9ef
      bgGrad: `radial-gradient(1200px 600px at 15% -10%, ${alpha(cp('latte', 'mauve'), 0.14)} 0%, transparent 60%)`,
      surface: cp('latte', 'base'),        // #eff1f5
      surface2: cp('latte', 'mantle'),     // #e6e9ef
      surface3: cp('latte', 'crust'),      // #dce0e8
      border: cp('latte', 'crust'),        // #dce0e8
      borderStrong: cp('latte', 'surface1'), // #bcc0cc
      text: cp('latte', 'text'),           // #4c4f69
      textMid: cp('latte', 'subtext1'),    // #5c5f77
      // subtext0 is #6c6f85, which measures 4.05:1 on --surface3 (#dce0e8).
      // Derived: the same hue darkened until it cleared the floor.
      textDim: '#5a5d73',
      accent: cp('latte', 'blue'),         // #1e66f5
      accentHover: cp('latte', 'sapphire'), // #209fb5
      // Catppuccin's `base` (#eff1f5) is the intended on-accent ink, but it
      // measures 4.34:1 on this blue — under the 4.5:1 a button label needs.
      // White clears it at 4.91:1.
      accentInk: '#ffffff',
      ok: cp('latte', 'green'),            // #40a02b
      // yellow is #df8e1d, which is 2.6:1 on base — unreadable as text. The
      // warning colour is used for text in this app, so it takes the darker
      // peach, which is what Catppuccin's own Latte guidance uses for text.
      warn: cp('latte', 'peach'),          // #fe640b
      warnInk: '#8c3a00',
      err: cp('latte', 'red'),             // #d20f39
      // maroon is #e64553, which measures 2.97:1 on --surface-3 — it is an
      // accent colour upstream, not a text colour. Derived: same hue, darkened
      // until it clears all three latte surfaces.
      errInk: '#ad343e',
      gridLine: alpha(cp('latte', 'text'), 0.1),
      shadow: 'light',
    },
  },

  /* --- Rosé Pine -------------------------------------------------------- */

  'rose-pine': {
    label: { zh: '玫瑰松', en: 'Rosé Pine' },
    scheme: 'dark',
    credit: 'Rosé Pine (MIT)',
    tokens: {
      bg: rp('main', 'base'),              // #191724
      bgGrad: `radial-gradient(1200px 600px at 15% -10%, ${alpha(rp('main', 'iris'), 0.18)} 0%, transparent 60%)`,
      surface: rp('main', 'surface'),      // #1f1d2e
      surface2: rp('main', 'overlay'),     // #26233a
      surface3: rp('main', 'highlightMed'), // #403d52
      border: rp('main', 'highlightMed'),  // #403d52
      borderStrong: rp('main', 'highlightHigh'), // #524f67
      text: rp('main', 'text'),            // #e0def4
      // subtle is #908caa, which measures 3.25:1 on --surface-3. Derived: the
      // same hue lightened until both this and --text-dim clear the floor.
      textMid: '#aeabc1',
      // muted (#6e6a86) is worse still, so the dim level shares the derived
      // value rather than being a third, even fainter grey.
      textDim: '#aeabc1',
      accent: rp('main', 'foam'),          // #9ccfd8
      accentHover: rp('main', 'iris'),     // #c4a7e7
      accentInk: rp('main', 'base'),
      ok: rp('main', 'pine'),              // #31748f — darkened below
      warn: rp('main', 'gold'),            // #f6c177
      warnInk: rp('main', 'gold'),
      err: rp('main', 'love'),             // #eb6f92
      errInk: rp('main', 'rose'),          // #ebbcba
      gridLine: alpha(rp('main', 'text'), 0.08),
      shadow: 'dark',
    },
  },

  'rose-pine-dawn': {
    label: { zh: '玫瑰松·黎明', en: 'Rosé Pine Dawn' },
    scheme: 'light',
    credit: 'Rosé Pine (MIT)',
    tokens: {
      bg: rp('dawn', 'overlay'),           // #f2e9e1
      bgGrad: `radial-gradient(1200px 600px at 15% -10%, ${alpha(rp('dawn', 'iris'), 0.14)} 0%, transparent 60%)`,
      surface: rp('dawn', 'surface'),      // #fffaf3
      surface2: rp('dawn', 'overlay'),     // #f2e9e1
      surface3: rp('dawn', 'highlightLow'), // #f4ede8
      border: rp('dawn', 'highlightMed'),  // #dfdad9
      borderStrong: rp('dawn', 'highlightHigh'), // #cecacd
      text: rp('dawn', 'text'),            // #575279
      // subtle is #797593 — 3.62:1 on the darkest of the three surfaces.
      // Derived: same hue darkened to clear the floor on all three.
      textMid: '#65617a',
      // muted (#9893a5) is 2.7:1, far worse, so dim shares the derived value.
      textDim: '#65617a',
      accent: rp('dawn', 'pine'),          // #286983
      accentHover: rp('dawn', 'iris'),     // #907aa9
      accentInk: rp('dawn', 'surface'),
      ok: rp('dawn', 'pine'),              // #286983
      warn: rp('dawn', 'gold'),            // #ea9d34 — 2.1:1, darkened below
      warnInk: '#8a5a00',
      err: rp('dawn', 'love'),             // #b4637a
      // love measures 3.50:1 on --surface-2 as text. Derived: darkened until
      // it clears all three dawn surfaces.
      errInk: '#995468',
      gridLine: alpha(rp('dawn', 'text'), 0.1),
      shadow: 'light',
    },
  },
};

export const PALETTE_KEYS = Object.keys(PALETTES);

/** The palette for a key, falling back to the default dark rather than throwing. */
export function paletteOf(key) {
  return PALETTES[key] ?? PALETTES.dark;
}

/**
 * The custom properties one palette defines, as a `{ '--name': value }` map.
 *
 * Returned rather than written to a stylesheet so the contrast test can read
 * exactly what the browser would be given, instead of re-parsing the CSS.
 */
export function cssVariables(key) {
  const { tokens, scheme } = paletteOf(key);
  const shadows = tokens.shadow === 'dark'
    ? {
      '--shadow-1': '0 1px 2px rgba(0, 0, 0, 0.4)',
      '--shadow-2': '0 4px 16px rgba(0, 0, 0, 0.35)',
      '--shadow-3': '0 16px 48px rgba(0, 0, 0, 0.55)',
      '--scrim': 'rgba(5, 7, 11, 0.72)',
    }
    : {
      '--shadow-1': '0 1px 2px rgba(16, 24, 40, 0.06)',
      '--shadow-2': '0 4px 14px rgba(16, 24, 40, 0.08)',
      '--shadow-3': '0 16px 48px rgba(16, 24, 40, 0.16)',
      '--scrim': 'rgba(16, 24, 40, 0.4)',
    };

  return {
    '--bg': tokens.bg,
    '--bg-grad': tokens.bgGrad,
    '--surface': tokens.surface,
    '--surface-2': tokens.surface2,
    '--surface-3': tokens.surface3,
    '--border': tokens.border,
    '--border-strong': tokens.borderStrong,
    '--text': tokens.text,
    '--text-mid': tokens.textMid,
    '--text-dim': tokens.textDim,
    '--accent': tokens.accent,
    /*
     * Two hovers, because they were one token doing two incompatible jobs.
     *
     * `--accent-hover` keeps the palette's own companion hue — Rosé Pine pairs
     * foam with iris, Catppuccin pairs blue with lavender. That is the right
     * relationship for the brand gradient, whose far end should be a
     * neighbouring hue rather than a lighter copy of the near end.
     *
     * `--accent-hover-solid` is for filled controls, where the pointer must
     * look like it is pressing the same button rather than a different one. It
     * is derived from the accent so the hue cannot drift, and stepped in the
     * direction the scheme reads as "raised": lighter on a dark palette,
     * darker on a light one.
     */
    '--accent-hover': tokens.accentHover,
    '--accent-hover-solid': shiftLightness(tokens.accent, scheme === 'dark' ? 0.14 : -0.16),
    /*
     * The dark end of the brand gradient.
     *
     * Derived rather than declared per palette. A third hand-picked brand
     * colour would be one more thing to keep in step across six themes, and the
     * one most likely to be got wrong: a "deep" colour chosen against a dark
     * background goes muddy on a light one. A fixed darkening of the palette's
     * own accent is right on all six by construction.
     *
     * Dark palettes darken less, because their accents are already light and a
     * large step would push the far end of the gradient below the contrast the
     * accent was checked at.
     */
    '--brand-deep': darkenHex(tokens.accent, scheme === 'dark' ? 0.28 : 0.34),
    '--accent-soft': alpha(tokens.accent, 0.12),
    '--accent-line': alpha(tokens.accent, 0.35),
    '--accent-ink': tokens.accentInk,
    '--ok': tokens.ok,
    '--warn': tokens.warn,
    '--warn-soft': alpha(tokens.warn, 0.1),
    '--warn-line': alpha(tokens.warn, 0.32),
    '--warn-ink': tokens.warnInk,
    '--err': tokens.err,
    '--err-soft': alpha(tokens.err, 0.1),
    '--err-line': alpha(tokens.err, 0.32),
    '--err-ink': tokens.errInk,
    '--grid-line': tokens.gridLine,
    ...shadows,
  };
}

/** The three surface levels body text is rendered on, for contrast checks. */
export const TEXT_SURFACES = ['--surface', '--surface-2', '--surface-3'];
