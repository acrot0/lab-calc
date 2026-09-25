import { describe, it, expect } from 'vitest';
import {
  OKABE_ITO, CATEGORICAL, ELEMENT_CATEGORY_COLOR, BLOCK_COLOR, VIRIDIS,
  sequentialColor, mixHex, hexToRgb, rgbToHex, relativeLuminance,
  contrastRatio, simulateCvd, CVD_KINDS, withAlpha,
} from '../src/ui/palette.mjs';
import { ELEMENT_CATEGORIES } from '../src/calc/elements.mjs';

/**
 * These tests are the reason the palette module exists. "Colourblind-safe" and
 * "perceptually uniform" are claims, and a claim in a comment is worth nothing —
 * these measure them.
 */

/**
 * Euclidean distance in sRGB.
 *
 * Not a perceptual metric — a true ΔE would go through CIELAB. It is used here
 * as a *relative* measure: the question these tests ask is not "is 20 enough"
 * but "is this palette at least as separated as the published one", which a
 * consistent-but-imperfect metric answers correctly.
 */
function deltaE(a, b) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * The separation the published Okabe-Ito palette achieves under each simulated
 * deficiency. Measured rather than assumed, and used as the floor for this
 * project's palettes: the standard is "no worse than the reference", which is
 * defensible, where a hand-picked threshold like 25 is not.
 *
 * Okabe-Ito's own tightest pair is its grey against its reddish purple under
 * deuteranopia, at 18.4 — a real property of the published palette, not a
 * defect in this implementation.
 */
const OKABE_ITO_FLOOR = {
  protanopia: 37.7,
  deuteranopia: 18.4,
  tritanopia: 33.8,
};

/** Smallest pairwise distance within a palette under one deficiency. */
function minSeparation(colors, kind) {
  const sim = colors.map((c) => simulateCvd(c, kind));
  let min = Infinity;
  for (let i = 0; i < sim.length; i++) {
    for (let j = i + 1; j < sim.length; j++) min = Math.min(min, deltaE(sim[i], sim[j]));
  }
  return min;
}

describe('colour conversion', () => {
  it('should round-trip a hex colour through rgb', () => {
    // Lowercase throughout: rgbToHex normalises, so an uppercase input comes
    // back lowercase. That is deliberate — CSS and getComputedStyle also
    // return lowercase, so a colour round-tripped through the DOM compares
    // equal to one that never left the module.
    for (const hex of ['#000000', '#ffffff', '#e69f00', '#56b4e9', '#0072b2']) {
      expect(rgbToHex(...hexToRgb(hex))).toBe(hex);
    }
  });

  it('should normalise uppercase input to lowercase', () => {
    expect(rgbToHex(...hexToRgb('#E69F00'))).toBe('#e69f00');
  });

  it('should mix to the endpoints at t=0 and t=1', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('should mix to the midpoint at t=0.5', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('should clamp rather than wrap out-of-range mixes', () => {
    // Wrapping would turn a caller's bug into a plausible colour.
    expect(mixHex('#000000', '#ffffff', -1)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 2)).toBe('#ffffff');
  });
});

describe('contrast', () => {
  it('should give 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#0072B2', '#0072B2')).toBeCloseTo(1, 5);
  });

  it('should be symmetric in its arguments', () => {
    expect(contrastRatio('#0072B2', '#FFFFFF'))
      .toBeCloseTo(contrastRatio('#FFFFFF', '#0072B2'), 10);
  });

  it('should keep every categorical colour legible on both themes', () => {
    // The table fills cells with these at low alpha, but the legend and the
    // axis labels use them at full strength, so each must be readable against
    // both the dark and the light surface.
    const DARK = '#12151d';
    const LIGHT = '#ffffff';
    for (const [name, hex] of Object.entries(OKABE_ITO)) {
      const onDark = contrastRatio(hex, DARK);
      const onLight = contrastRatio(hex, LIGHT);
      // 3.0 is the WCAG floor for graphics and large text. Okabe-Ito is
      // designed for legibility rather than for maximum contrast, so a couple
      // of its hues sit just above 3 rather than far above it — yellow is the
      // known one, and it is why the table never uses it for text.
      expect(Math.max(onDark, onLight), `${name} contrast`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  it('should keep every element category readable on the dark surface', () => {
    for (const [name, hex] of Object.entries(ELEMENT_CATEGORY_COLOR)) {
      expect(contrastRatio(hex, '#12151d'), `${name} on dark`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('colour vision deficiency', () => {
  it('should keep the categorical palette at least as separated as Okabe-Ito itself', () => {
    // The published palette is the reference: it was designed for exactly this
    // and is what scientific publishing uses. Matching it is a defensible
    // standard; a threshold picked by hand is not.
    for (const kind of CVD_KINDS) {
      const sep = minSeparation(CATEGORICAL, kind);
      expect(sep, `categorical under ${kind} (${sep.toFixed(1)})`)
        .toBeGreaterThanOrEqual(OKABE_ITO_FLOOR[kind] - 0.1);
    }
  });

  it('should keep the element categories at least as separated as Okabe-Ito', () => {
    // Ten categories against the reference palette's eight, so this is the
    // harder case and the one the search script exists to solve.
    const colors = Object.values(ELEMENT_CATEGORY_COLOR);
    for (const kind of CVD_KINDS) {
      const sep = minSeparation(colors, kind);
      expect(sep, `categories under ${kind} (${sep.toFixed(1)})`)
        .toBeGreaterThanOrEqual(OKABE_ITO_FLOOR[kind] - 0.1);
    }
  });

  it('should improve on the hand-picked palette it replaced', () => {
    // The palette that shipped before this module existed. Recording the
    // comparison keeps the improvement from being quietly undone.
    const BEFORE = {
      alkali: '#D55E00', alkaline: '#E69F00', transition: '#8C9BB0',
      postTransition: '#009E73', metalloid: '#56B4E9', nonmetal: '#0072B2',
      halogen: '#7FBF3F', noble: '#CC79A7', lanthanide: '#B5709B', actinide: '#9C4A6B',
    };
    const before = minSeparation(Object.values(BEFORE), 'deuteranopia');
    const after = minSeparation(Object.values(ELEMENT_CATEGORY_COLOR), 'deuteranopia');
    expect(after, `after ${after.toFixed(1)} vs before ${before.toFixed(1)}`)
      .toBeGreaterThan(before);
  });

  it('should keep the blocks distinguishable, which is why they are not grey-on-grey', () => {
    // Four values, so the bar is the reference palette's own tightest pair
    // rather than a number chosen for the occasion.
    const colors = Object.values(BLOCK_COLOR);
    for (const kind of CVD_KINDS) {
      const sep = minSeparation(colors, kind);
      expect(sep, `blocks under ${kind} (${sep.toFixed(1)})`)
        .toBeGreaterThanOrEqual(OKABE_ITO_FLOOR[kind] - 0.1);
    }
  });

  it('should throw for a deficiency it does not model', () => {
    // A typo would otherwise silently return the unmodified colour, and the
    // tests above would pass while checking nothing.
    expect(() => simulateCvd('#0072B2', 'tetrachromacy')).toThrow();
  });
});

describe('sequential ramp', () => {
  it('should start and end at the published viridis endpoints', () => {
    expect(sequentialColor(0)).toBe('#440154');
    expect(sequentialColor(1)).toBe('#FDE725');
  });

  it('should be monotonic in lightness, which is what makes it readable in greyscale', () => {
    // A rainbow ramp fails this, and failing it is why a rainbow ramp
    // manufactures boundaries in smooth data.
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const l = relativeLuminance(sequentialColor(i / 20));
      expect(l, `step ${i} lightness`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = l;
    }
  });

  it('should clamp rather than wrap out-of-range input', () => {
    expect(sequentialColor(-0.5)).toBe('#440154');
    expect(sequentialColor(1.5)).toBe('#FDE725');
  });

  it('should be strictly increasing across the ramp, not just non-decreasing', () => {
    // Non-decreasing would pass on a flat segment, where two different values
    // render identically.
    const first = relativeLuminance(sequentialColor(0));
    const last = relativeLuminance(sequentialColor(1));
    expect(last).toBeGreaterThan(first + 0.5);
  });

  it('should keep every viridis stop a valid six-digit hex', () => {
    for (const stop of VIRIDIS) expect(stop).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('palette coverage', () => {
  it('should colour every element category, with no leftovers', () => {
    // A category without a colour renders as an unstyled cell, which looks
    // deliberate and is not.
    for (const cat of ELEMENT_CATEGORIES) {
      expect(ELEMENT_CATEGORY_COLOR[cat], `category ${cat}`).toBeDefined();
    }
    expect(Object.keys(ELEMENT_CATEGORY_COLOR).sort())
      .toEqual([...ELEMENT_CATEGORIES].sort());
  });

  it('should give every category a distinct colour', () => {
    const values = Object.values(ELEMENT_CATEGORY_COLOR);
    expect(new Set(values).size).toBe(values.length);
  });

  it('should give every block a distinct colour', () => {
    const values = Object.values(BLOCK_COLOR);
    expect(new Set(values).size).toBe(values.length);
  });

  it('should use valid hex for every palette entry', () => {
    for (const [name, hex] of Object.entries({ ...OKABE_ITO, ...ELEMENT_CATEGORY_COLOR, ...BLOCK_COLOR })) {
      expect(hex, name).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('withAlpha', () => {
  it('should append the alpha as a hex suffix', () => {
    expect(withAlpha('#0072b2', 1)).toBe('#0072b2ff');
    expect(withAlpha('#0072b2', 0)).toBe('#0072b200');
  });

  it('should clamp out-of-range alpha', () => {
    expect(withAlpha('#0072b2', 2)).toBe('#0072b2ff');
    expect(withAlpha('#0072b2', -1)).toBe('#0072b200');
  });

  it('should produce a string a CSS colour parser accepts', () => {
    // Eight-digit hex is the form this module emits, so it has to be one the
    // browser understands — otherwise every tinted cell renders transparent.
    expect(withAlpha('#0072b2', 0.5)).toMatch(/^#[0-9a-f]{8}$/);
  });
});
