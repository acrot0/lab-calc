/**
 * Colour, chosen by evidence rather than taste.
 *
 * Two kinds of data, two kinds of palette, and the distinction is the whole
 * point of this module:
 *
 *   Categorical — element categories, blocks, series. The values have no order,
 *   so the colours must not imply one. Okabe-Ito: eight hues, chosen so that
 *   any two stay distinguishable under the common forms of colour vision
 *   deficiency, and distinguishable in greyscale.
 *
 *   Sequential — atomic mass, electronegativity, radius. The values have an
 *   order, so the ramp must be perceptually uniform: equal steps in the data
 *   should look like equal steps in colour. Viridis, which is also monotonic in
 *   lightness (so it survives being printed in black and white) and readable
 *   under colour vision deficiency.
 *
 * A rainbow ramp is the usual default and the wrong one: its lightness is not
 * monotonic, so it manufactures apparent boundaries where the data is smooth,
 * and it is unreadable in greyscale or with deuteranopia. It is not used here.
 *
 * Sources:
 *   Okabe & Ito, "Color Universal Design" (2008), the palette adopted by
 *   Nature and used across scientific publishing.
 *   Smith & van der Walt, "A perceptual color map for scientific
 *   visualization" (2015) — viridis/plasma/inferno/magma.
 */

/**
 * Okabe-Ito. The eight hues are the palette's whole design; the names are this
 * project's labels for them.
 *
 * Pure black is deliberately absent: on a dark theme it is invisible, and on a
 * light theme it reads as a border rather than a category.
 */
export const OKABE_ITO = {
  orange: '#E69F00',
  skyBlue: '#56B4E9',
  bluishGreen: '#009E73',
  yellow: '#F0E442',
  blue: '#0072B2',
  vermillion: '#D55E00',
  reddishPurple: '#CC79A7',
  grey: '#999999',
};

/** The palette as an ordered list, for cycling through categories. */
export const CATEGORICAL = Object.values(OKABE_ITO);

/**
 * Element categories, in the chemistry's own terms.
 *
 * These are NOT the Okabe-Ito hues assigned in order. Chemistry has
 * conventions — alkali metals read as red, halogens as green, noble gases as
 * violet — and a palette that contradicts them is harder to read than one that
 * does not, however defensible its colour science.
 *
 * Five of the ten are Okabe-Ito's own values, because the convention and the
 * palette agree for those. The other five were searched by
 * `scripts/search-palette.mjs` over hue, saturation and lightness together,
 * scored by the worst pairwise separation across all three simulated forms of
 * colour vision deficiency and constrained to clear the WCAG contrast floor on
 * the dark surface. The search is committed so the choice is reproducible
 * rather than a matter of taste.
 *
 * The result: the tightest pair in the palette is 33.8 apart, against 13.2 for
 * the hand-picked version it replaced. Under deuteranopia the old palette put
 * the transition metals 13 from the noble gases, which is close enough to read
 * as one colour.
 */
export const ELEMENT_CATEGORY_COLOR = {
  alkali: '#D55E00',          // Okabe-Ito vermillion — the conventional deep red
  alkaline: '#E69F00',        // Okabe-Ito orange, lighter than the alkali
  transition: '#A5A9AC',      // grey, faintly blue: the bulk of the table
  postTransition: '#009E73',  // Okabe-Ito bluish green
  metalloid: '#56B4E9',       // Okabe-Ito sky blue
  nonmetal: '#0072B2',        // Okabe-Ito blue — the reactive non-metals
  halogen: '#D9D926',         // yellow, the conventional halogen green-yellow
  noble: '#CC79A7',           // Okabe-Ito reddish purple — the classic violet
  lanthanide: '#907DCA',      // violet, lighter
  actinide: '#AA4198',        // purple, redder than the lanthanide
};

/**
 * The s/p/d/f blocks. Four values, so four well-separated hues drawn from the
 * same set as the categories — the two views describe the same table, and a
 * block colour that appears nowhere in the category view would read as a
 * different kind of thing.
 */
export const BLOCK_COLOR = {
  s: '#D55E00',   // vermillion
  p: '#0072B2',   // blue
  d: '#A5A9AC',   // grey, as in the category view's transition metals
  f: '#907DCA',   // violet, as in the category view's lanthanide
};

/**
 * Viridis, sampled at 16 stops.
 *
 * Stored as hex rather than computed from the original polynomial so the values
 * are inspectable — a reader can check a stop against the published ramp
 * without running the interpolation. `sequentialColor` interpolates between
 * them.
 */
export const VIRIDIS = [
  '#440154', '#481F70', '#443983', '#3B528B', '#31688E', '#287C8E', '#21918C',
  '#20A486', '#27AD81', '#35B779', '#4AC16D', '#5EC962', '#7AD151', '#A0DA39',
  '#C8E020', '#FDE725',
];

/**
 * A colour on the viridis ramp for a value in [0, 1].
 *
 * Values outside the range are clamped rather than wrapped: a caller passing
 * 1.2 has a bug, and wrapping would hide it behind a plausible colour.
 */
export function sequentialColor(t) {
  const clamped = Math.min(1, Math.max(0, t));
  const pos = clamped * (VIRIDIS.length - 1);
  const i = Math.floor(pos);
  if (i >= VIRIDIS.length - 1) return VIRIDIS[VIRIDIS.length - 1];
  return mixHex(VIRIDIS[i], VIRIDIS[i + 1], pos - i);
}

/** Linear interpolation between two hex colours, in sRGB. */
export function mixHex(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t,
  );
}

export function hexToRgb(hex) {
  const s = hex.replace('#', '');
  return [
    Number.parseInt(s.slice(0, 2), 16),
    Number.parseInt(s.slice(2, 4), 16),
    Number.parseInt(s.slice(4, 6), 16),
  ];
}

/**
 * Lowercase, always.
 *
 * The palette constants are uppercase for readability, so a function returning
 * uppercase would look consistent while making every generated colour fail to
 * match its own source. Lowercase is also what CSS and the DOM return from
 * `getComputedStyle`, so round-tripping a colour through the page compares
 * equal.
 */
export function rgbToHex(r, g, b) {
  const h = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toLowerCase();
}

/**
 * WCAG relative luminance.
 *
 * The 0.03928 threshold and the 1.055 exponent are the sRGB transfer function's
 * linear segment and gamma, not tunable constants.
 */
export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two colours, from 1 to 21.
 *
 * The 4.5 floor for body text and 3.0 for large text or graphics are the
 * standard's numbers; callers compare against them rather than this function
 * deciding.
 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Simulate the three common forms of colour vision deficiency.
 *
 * Uses the Machado et al. (2009) matrices at full severity. The point is not
 * clinical accuracy — it is to catch a palette where two categories collapse
 * into the same colour for a deuteranopic reader, which these matrices do
 * reliably.
 */
const CVD_MATRICES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

export function simulateCvd(hex, kind) {
  const m = CVD_MATRICES[kind];
  if (!m) throw new Error(`palette: unknown colour vision deficiency ${String(kind)}`);
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    m[0][0] * r + m[0][1] * g + m[0][2] * b,
    m[1][0] * r + m[1][1] * g + m[1][2] * b,
    m[2][0] * r + m[2][1] * g + m[2][2] * b,
  );
}

/** The three deficiency kinds, for iterating in tests. */
export const CVD_KINDS = Object.keys(CVD_MATRICES);

/**
 * A translucent version of a colour, for cell fills.
 *
 * Alpha rides inside the hex string as the two-digit suffix rather than as an
 * rgba() so the result still parses as a hex colour — which is what
 * `mixHex` and the contrast checks expect.
 */
export function withAlpha(hex, alpha) {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16).padStart(2, '0');
  return `${hex}${a}`.toLowerCase();
}
